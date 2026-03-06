/**
 * Language detection + Claude Haiku translation for non-Traditional-Chinese content.
 * Requires ENABLE_TRANSLATION=true and ANTHROPIC_API_KEY.
 */

import type { TranslationResult } from '../extractors/types.js';

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
}

/* ------------------------------------------------------------------ */
/*  Language detection                                                */
/* ------------------------------------------------------------------ */

// Characters strongly indicating Simplified Chinese (simplified-only variants)
const SC_CHARS = /[与专业东丝两严丧个丰临为丽举义乌乐乔习书买乱争亏云产亲亩从仅仓创办务动劝双发变叹号台员问团园围图国坚块坛垄场壮处备够头夸夹奋奖妇学实宝对导层岁岛岭币帅师带广庄庆应库张弹归当录总惊战户扩择拥担拨挡损换据操携收敛数整斗断时暂术极权条杂标样桥业检楼横档机杀杂杰构权来标极杨树桥业检楼乐栏标样档桥梦检棂杀杂栏权条极样标档检桥梦楼械横欢欣欧歼毕毙沟没沪济浊浓减渡湾灭灯灵炉点烦热爱爷片牵独献环现玛玩珍球琴瓮瓶瘫盖盗监盘眯矫确礼离种秋穷窗竞笔节范荣药虽蛮蜡补表观计认训让议记论讲许诊证评词试诗话诞该详语误说请诸谁调谈谋谊谓谜谱费贡财贩贯贴贸贺资赋赏赔赛赞赠赢赵跃转轻载较辆辩辽达迁过运还这进远违连选遥邓邮邻郑释钟钢钱铁铃银锁铺错键锤锅长门闭问闪间闲闻阅队阳阶际陈陕险随隐难雁雾霸雳靠颖颗题风飞饥饭饮马骗骤验鱼鸟鸣鼎鼓齐齿龙龟]/;
// Characters strongly indicating Traditional Chinese (traditional-only variants)
const TC_CHARS = /[與專業東絲兩嚴喪個豐臨為麗舉義烏樂喬習書買亂爭虧雲產親畝從僅倉創辦務動勸雙發變嘆號臺員問團園圍圖國堅塊壇壟場壯處備夠頭誇夾奮獎婦學實寶對導層歲島嶺幣帥師帶廣莊慶應庫張彈歸當錄總驚戰戶擴擇擁擔撥擋損換據操攜收斂數整鬥斷時暫術極權條雜標樣橋業檢樓橫檔機殺雜傑構權來標極楊樹橋業檢樓樂欄標樣檔檢橋夢樓械橫歡欣歐殲畢斃溝沒滬濟濁濃減渡灣滅燈靈爐點煩熱愛爺片牽獨獻環現瑪玩珍球琴甕瓶癱蓋盜監盤瞇矯確禮離種秋窮窗競筆節範榮藥雖蠻蠟補表觀計認訓讓議記論講許診證評詞試詩話誕該詳語誤說請諸誰調談謀誼謂謎譜費貢財販貫貼貿賀資賦賞賠賽贊贈贏趙躍轉輕載較輛辯遼達遷過運還這進遠違連選遙鄧郵鄰鄭釋鐘鋼錢鐵鈴銀鎖鋪錯鍵錘鍋長門閉問閃間閒聞閱隊陽階際陳陝險隨隱難雁霧霸靂靠穎顆題風飛飢飯飲馬騙驟驗魚鳥鳴鼎鼓齊齒龍龜]/;
const ASCII_HEAVY_RE = /^[\x00-\x7F\s\p{P}\p{S}\d]+$/u;

type DetectedLang = TranslationResult['detectedLanguage'];

export function detectLanguage(sample: string): DetectedLang {
  // Mostly ASCII → English
  const asciiRatio = sample.replace(/[\s\p{P}\p{S}]/gu, '').length > 0
    ? [...sample].filter(c => c.charCodeAt(0) < 128).length / [...sample].filter(c => !/[\s]/.test(c)).length
    : 0;
  if (asciiRatio > 0.85) return 'en';

  // Count SC vs TC marker characters
  const scCount = (sample.match(SC_CHARS) ?? []).length;
  const tcCount = (sample.match(TC_CHARS) ?? []).length;

  if (scCount > 0 || tcCount > 0) {
    // If clearly more SC markers → Simplified Chinese
    if (scCount > tcCount * 1.5) return 'zh-CN';
    // If clearly more TC markers → Traditional Chinese (no translation needed)
    if (tcCount >= scCount) return 'zh-TW' as DetectedLang;
  }

  // Has CJK characters but can't determine → treat as other
  return 'other';
}

/* ------------------------------------------------------------------ */
/*  Translation via Claude Haiku                                      */
/* ------------------------------------------------------------------ */

export async function translateIfNeeded(
  title: string,
  text: string,
  apiKey: string,
): Promise<TranslationResult | null> {
  const sample = (title + ' ' + text).slice(0, 500);
  const lang = detectLanguage(sample);

  // Already Traditional Chinese or unknown — skip
  if (lang !== 'en' && lang !== 'zh-CN') return null;

  const textToTranslate = text.length > 2000 ? text.slice(0, 2000) + '\n...(truncated)' : text;

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15_000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: `你是翻譯員。將以下內容翻譯成繁體中文。
規則：
- 保留 Markdown 格式、程式碼、專有名詞（品牌名、產品名、技術術語可保留英文）
- 保留 @username、URL、emoji
- 使用台灣用語習慣
- 只輸出 JSON：{"translatedTitle":"標題翻譯","translatedText":"內容翻譯"}`,
        messages: [{ role: 'user', content: `標題: "${title}"\n\n內容:\n${textToTranslate}` }],
      }),
      signal: ac.signal,
    });

    if (!res.ok) return null;

    const data = await res.json() as AnthropicResponse;
    const responseText = data.content?.[0]?.text ?? '';
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as {
      translatedTitle?: unknown;
      translatedText?: unknown;
    };

    const translatedText = typeof parsed.translatedText === 'string' ? parsed.translatedText : null;
    if (!translatedText) return null;

    return {
      detectedLanguage: lang,
      translatedText,
      translatedTitle: typeof parsed.translatedTitle === 'string' ? parsed.translatedTitle : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
