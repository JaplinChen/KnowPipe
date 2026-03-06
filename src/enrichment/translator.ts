/**
 * Language detection + translation for non-Traditional-Chinese content.
 * - zh-CN → zh-TW: opencc-js (deterministic, free, instant)
 * - en → zh-TW: Google Translate (free, no API key)
 * No paid API required.
 */

import type { TranslationResult } from '../extractors/types.js';
// @ts-expect-error opencc-js lacks proper TS declarations
import * as OpenCC from 'opencc-js';
import translate from 'google-translate-api-x';

/* ------------------------------------------------------------------ */
/*  OpenCC converter (singleton)                                       */
/* ------------------------------------------------------------------ */

const s2tw = OpenCC.ConverterFactory(
  OpenCC.Locale.from.cn,
  OpenCC.Locale.to.tw,
);

/* ------------------------------------------------------------------ */
/*  Language detection                                                */
/* ------------------------------------------------------------------ */

// Characters strongly indicating Simplified Chinese (simplified-only variants)
const SC_CHARS = /[与专业东丝两严丧个丰临为丽举义乌乐乔习书买乱争亏云产亲亩从仅仓创办务动劝双发变叹号台员问团园围图国坚块坛垄场壮处备够头夸夹奋奖妇学实宝对导层岁岛岭币帅师带广庄庆应库张弹归当录总惊战户扩择拥担拨挡损换据携收敛数整斗断时暂术极权条杂标样桥业检楼横档机杀杰构来杨树梦棂栏械欢欣欧歼毕毙沟没沪济浊浓减渡湾灭灯灵炉点烦热爱爷片牵独献环现玛玩珍球琴瓮瓶瘫盖盗监盘眯矫确礼离种秋穷窗竞笔节范荣药虽蛮蜡补表观计认训让议记论讲许诊证评词试诗话诞该详语误说请诸谁调谈谋谊谓谜谱费贡财贩贯贴贸贺资赋赏赔赛赞赠赢赵跃转轻载较辆辩辽达迁过运还这进远违连选遥邓邮邻郑释钟钢钱铁铃银锁铺错键锤锅长门闭问闪间闲闻阅队阳阶际陈陕险随隐难雁雾霸雳靠颖颗题风飞饥饭饮马骗骤验鱼鸟鸣鼎鼓齐齿龙龟]/g;
// Characters strongly indicating Traditional Chinese (traditional-only variants)
const TC_CHARS = /[與專業東絲兩嚴喪個豐臨為麗舉義烏樂喬習書買亂爭虧雲產親畝從僅倉創辦務動勸雙發變嘆號臺員問團園圍圖國堅塊壇壟場壯處備夠頭誇夾奮獎婦學實寶對導層歲島嶺幣帥師帶廣莊慶應庫張彈歸當錄總驚戰戶擴擇擁擔撥擋損換據攜收斂數整鬥斷時暫術極權條雜標樣橋業檢樓橫檔機殺傑構來楊樹夢欄械歡欣歐殲畢斃溝沒滬濟濁濃減渡灣滅燈靈爐點煩熱愛爺片牽獨獻環現瑪玩珍球琴甕瓶癱蓋盜監盤瞇矯確禮離種秋窮窗競筆節範榮藥雖蠻蠟補表觀計認訓讓議記論講許診證評詞試詩話誕該詳語誤說請諸誰調談謀誼謂謎譜費貢財販貫貼貿賀資賦賞賠賽贊贈贏趙躍轉輕載較輛辯遼達遷過運還這進遠違連選遙鄧郵鄰鄭釋鐘鋼錢鐵鈴銀鎖鋪錯鍵錘鍋長門閉問閃間閒聞閱隊陽階際陳陝險隨隱難雁霧霸靂靠穎顆題風飛飢飯飲馬騙驟驗魚鳥鳴鼎鼓齊齒龍龜]/g;

type DetectedLang = TranslationResult['detectedLanguage'];

export function detectLanguage(sample: string): DetectedLang {
  const asciiRatio = sample.replace(/[\s\p{P}\p{S}]/gu, '').length > 0
    ? [...sample].filter(c => c.charCodeAt(0) < 128).length / [...sample].filter(c => !/[\s]/.test(c)).length
    : 0;
  if (asciiRatio > 0.85) return 'en';

  const scCount = (sample.match(SC_CHARS) ?? []).length;
  const tcCount = (sample.match(TC_CHARS) ?? []).length;

  if (scCount > 0 || tcCount > 0) {
    if (scCount > tcCount * 1.5) return 'zh-CN';
    if (tcCount >= scCount) return 'zh-TW';
  }

  return 'other';
}

/* ------------------------------------------------------------------ */
/*  zh-CN → zh-TW via OpenCC (free, instant)                          */
/* ------------------------------------------------------------------ */

function convertSimplifiedToTraditional(title: string, text: string): TranslationResult {
  return {
    detectedLanguage: 'zh-CN',
    translatedText: s2tw(text),
    translatedTitle: s2tw(title),
  };
}

/* ------------------------------------------------------------------ */
/*  en → zh-TW via Google Translate (free, no API key)                */
/* ------------------------------------------------------------------ */

async function translateEnglish(
  title: string, text: string,
): Promise<TranslationResult | null> {
  const textToTranslate = text.length > 3000 ? text.slice(0, 3000) : text;

  try {
    const [titleResult, textResult] = await Promise.all([
      translate(title, { to: 'zh-TW' }),
      translate(textToTranslate, { to: 'zh-TW' }),
    ]);

    return {
      detectedLanguage: 'en',
      translatedText: textResult.text,
      translatedTitle: titleResult.text,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Public entry — no API key needed                                   */
/* ------------------------------------------------------------------ */

export async function translateIfNeeded(
  title: string, text: string, _apiKey?: string,
): Promise<TranslationResult | null> {
  const sample = (title + ' ' + text).slice(0, 500);
  const lang = detectLanguage(sample);

  if (lang === 'zh-CN') return convertSimplifiedToTraditional(title, text);
  if (lang === 'en') return translateEnglish(title, text);
  return null;
}
