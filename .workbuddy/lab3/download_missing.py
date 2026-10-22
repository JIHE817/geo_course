# -*- coding: utf-8 -*-
"""
补齐缺失的景点图片（CD046-CD060）：Bing 图片搜索抓取真实照片
- 已存在的文件自动跳过，可反复运行
- 每个景点最多尝试 8 个候选 URL，仅接受有效 JPEG（>15KB）
"""
import html as htmllib
import os
import re
import urllib.parse
import urllib.request
import sys

# ---------------- 配置（硬编码） ----------------
BASE = r"d:\temporarydeskpro\geo_course\public\images\attractions"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9",
}
SPOTS = [
    ("CD046", "战旗村景区"),
    ("CD047", "天府芙蓉园"),
    ("CD048", "天府国际慢城"),
    ("CD049", "道明竹艺村"),
    ("CD050", "凤凰湖湿地公园"),
    ("CD051", "白鹤滩湿地公园"),
    ("CD052", "丹景台"),
    ("CD053", "成都川菜博物馆"),
    ("CD054", "罨画池"),
    ("CD055", "竹溪湖"),
    ("CD056", "铁像寺水街"),
    ("CD057", "兴隆湖"),
    ("CD058", "川西竹海"),
    ("CD059", "宽窄巷子"),
    ("CD060", "纯阳观"),
]


def search_images(name):
    """Bing 图片异步接口搜索，返回原图直链列表"""
    q = urllib.parse.quote(f"{name} 风景")
    url = f"https://cn.bing.com/images/async?q={q}&first=1&count=25&mmosic=1"
    req = urllib.request.Request(url, headers=UA)
    raw = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "ignore")
    # murl 藏在 iusc 节点的 m 属性里，且被 HTML 实体转义（&quot;），先反转义再提取
    text = htmllib.unescape(raw)
    urls = [u.replace("\\/", "/") for u in re.findall(r'"murl":"(.*?)"', text)]
    return urls


def try_download(url, out):
    """下载并校验：必须是 >15KB 的 JPEG"""
    req = urllib.request.Request(url, headers=UA)
    data = urllib.request.urlopen(req, timeout=20).read()
    if len(data) < 15000:
        raise ValueError(f"文件过小 {len(data)}B")
    if data[:2] != b"\xff\xd8":
        raise ValueError("非 JPEG 数据")
    with open(out, "wb") as f:
        f.write(data)
    return len(data)


def main():
    if not os.path.isdir(BASE):
        print(f"[ERR] 目录不存在: {BASE}")
        sys.exit(1)
    ok = fail = skip = 0
    for code, name in SPOTS:
        out = os.path.join(BASE, f"{code}.jpg")
        if os.path.exists(out):
            print(f"[SKIP] {code} {name}")
            skip += 1
            continue
        done = False
        try:
            urls = search_images(name)
            print(f"[SRCH] {code} {name} 候选 {len(urls)} 个")
            for u in urls[:8]:
                if not u.startswith("http"):
                    continue
                try:
                    size = try_download(u, out)
                    print(f"[OK  ] {code} {name} {size}B")
                    ok += 1
                    done = True
                    break
                except Exception as e:
                    print(f"[RETR] {code} 候选失败: {str(e)[:60]}")
        except Exception as e:
            print(f"[ERR ] {code} 搜索失败: {str(e)[:80]}")
        if not done:
            fail += 1
            print(f"[FAIL] {code} {name}")
    print(f"===== 完成: 成功 {ok} | 失败 {fail} | 跳过 {skip} =====")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
