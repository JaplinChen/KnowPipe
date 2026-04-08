#!/usr/bin/env python3
"""
MediaCrawler FastAPI Server — 對接 ObsBot mediacrawler-client.ts
提供小紅書（XHS）和抖音（Douyin）帶 cookie 的內容抓取。

啟動方式：
  /opt/homebrew/bin/python3.11 scripts/mediacrawler-server.py

依賴安裝：
  /opt/homebrew/bin/pip3.11 install -r scripts/requirements-mediacrawler.txt
  /opt/homebrew/bin/python3.11 -m playwright install chromium

Cookie 設定：
  1. 在瀏覽器登入小紅書 / 抖音
  2. 安裝 Cookie-Editor 擴充功能 → 匯出 JSON
  3. 貼入 data/mediacrawler-cookies.json 的對應欄位
"""

import json
import os
import re
from pathlib import Path
from datetime import datetime

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ── 路徑設定 ────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
COOKIE_FILE = ROOT / "data" / "mediacrawler-cookies.json"
PORT = int(os.environ.get("MEDIACRAWLER_PORT", "8765"))

# ── FastAPI app ─────────────────────────────────────────────────────────
app = FastAPI(title="MediaCrawler Server", version="1.0.0")


# ── 資料模型 ────────────────────────────────────────────────────────────
class CrawlRequest(BaseModel):
    url: str


class XhsResult(BaseModel):
    title: str
    content: str
    author: str
    authorHandle: str
    images: list[str]
    likes: int
    date: str


class DouyinResult(BaseModel):
    title: str
    description: str
    author: str
    authorHandle: str
    videoUrl: str
    likes: int
    date: str


# ── Cookie 工具 ─────────────────────────────────────────────────────────
def load_cookies(platform: str) -> str:
    """讀取指定平台的 cookie 字串。"""
    try:
        data = json.loads(COOKIE_FILE.read_text(encoding="utf-8"))
        return data.get(platform, "")
    except Exception:
        return ""


def parse_cookie_string(cookie_str: str) -> list[dict]:
    """解析 key=value; key=value 格式或 JSON 陣列格式的 cookie。"""
    if not cookie_str:
        return []
    try:
        parsed = json.loads(cookie_str)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    # key=value; 格式
    cookies = []
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            name, _, value = part.partition("=")
            cookies.append({"name": name.strip(), "value": value.strip()})
    return cookies


# ── 健康檢查 ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    xhs_cookie = bool(load_cookies("xhs"))
    douyin_cookie = bool(load_cookies("douyin"))
    return {
        "ok": True,
        "cookies": {"xhs": xhs_cookie, "douyin": douyin_cookie},
    }


# ── 小紅書抓取 ──────────────────────────────────────────────────────────
@app.post("/crawl/xhs", response_model=XhsResult)
async def crawl_xhs(req: CrawlRequest):
    """抓取小紅書貼文，需要 data/mediacrawler-cookies.json 的 xhs 欄位。"""
    cookie_str = load_cookies("xhs")

    # 嘗試使用 xhs library
    try:
        from xhs import XhsClient

        if not cookie_str:
            raise HTTPException(status_code=401, detail="小紅書 cookie 未設定，請填入 data/mediacrawler-cookies.json")

        client = XhsClient(cookie=cookie_str)

        # 解析 note ID
        note_id_match = re.search(r"/explore/([a-f0-9]+)", req.url) or \
                        re.search(r"/discovery/item/([a-f0-9]+)", req.url)
        if not note_id_match:
            raise HTTPException(status_code=400, detail=f"無法從 URL 解析 note ID：{req.url}")

        note_id = note_id_match.group(1)
        note = client.get_note_by_id(note_id)

        # 解析回傳結果
        note_data = note.get("data", {}) if isinstance(note, dict) else {}
        if not note_data:
            note_data = note if isinstance(note, dict) else {}

        title = note_data.get("title", "") or note_data.get("desc", "")[:80]
        content = note_data.get("desc", "") or note_data.get("content", "")
        author_info = note_data.get("user", {}) or {}
        author = author_info.get("nickname", "未知")
        author_handle = author_info.get("user_id", author)

        images = []
        image_list = note_data.get("image_list", []) or []
        for img in image_list:
            url_info = img.get("url_default", "") or img.get("url", "")
            if url_info:
                images.append(url_info)

        likes = note_data.get("interact_info", {}).get("liked_count", 0)
        if isinstance(likes, str):
            likes = int(re.sub(r"[^\d]", "", likes) or "0")

        return XhsResult(
            title=title or content[:80] or "小紅書貼文",
            content=content,
            author=author,
            authorHandle=f"@{author_handle}",
            images=images[:8],
            likes=likes or 0,
            date=datetime.now().strftime("%Y-%m-%d"),
        )

    except ImportError:
        raise HTTPException(status_code=500, detail="xhs 套件未安裝，請執行 pip install xhs")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"小紅書抓取失敗：{str(e)}")


# ── 抖音抓取 ────────────────────────────────────────────────────────────
@app.post("/crawl/douyin", response_model=DouyinResult)
async def crawl_douyin(req: CrawlRequest):
    """抓取抖音影片資訊，需要 data/mediacrawler-cookies.json 的 douyin 欄位。"""
    cookie_str = load_cookies("douyin")
    if not cookie_str:
        raise HTTPException(status_code=401, detail="抖音 cookie 未設定，請填入 data/mediacrawler-cookies.json")

    try:
        from playwright.async_api import async_playwright

        cookies = parse_cookie_string(cookie_str)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                viewport={"width": 390, "height": 844},
            )
            if cookies:
                # playwright 需要帶 domain
                pw_cookies = []
                for c in cookies:
                    pw_cookies.append({
                        "name": c.get("name", ""),
                        "value": c.get("value", ""),
                        "domain": ".douyin.com",
                        "path": "/",
                    })
                await context.add_cookies(pw_cookies)

            page = await context.new_page()
            await page.goto(req.url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)

            # 偵測登入牆
            body_text = await page.evaluate("() => document.body?.innerText?.slice(0, 200) || ''")
            if "登录" in body_text or "passport" in page.url:
                await browser.close()
                raise HTTPException(status_code=401, detail="抖音 cookie 已過期，請重新匯出")

            desc_el = await page.query_selector("[data-e2e='video-desc'], .video-info-detail, .desc")
            desc = await desc_el.inner_text() if desc_el else ""

            author_el = await page.query_selector("[data-e2e='video-author-title'], .author-name, .nickname")
            author = await author_el.inner_text() if author_el else "未知"

            handle_el = await page.query_selector("[data-e2e='video-author-uniqueid'], .unique-id")
            author_handle = await handle_el.inner_text() if handle_el else author

            likes_el = await page.query_selector("[data-e2e='like-count'], .like-count")
            likes_text = await likes_el.inner_text() if likes_el else "0"
            likes = int(re.sub(r"[^\d]", "", likes_text) or "0")

            await browser.close()

        return DouyinResult(
            title=desc.split("\n")[0][:80] or "抖音影片",
            description=desc or "（無文字描述）",
            author=author.strip(),
            authorHandle=f"@{author_handle.replace('@', '').strip()}",
            videoUrl=req.url,
            likes=likes,
            date=datetime.now().strftime("%Y-%m-%d"),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"抖音抓取失敗：{str(e)}")


# ── 入口 ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"[mediacrawler] 啟動於 http://localhost:{PORT}")
    print(f"[mediacrawler] Cookie 檔案：{COOKIE_FILE}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
