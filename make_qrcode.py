# -*- coding: utf-8 -*-
"""生成《仙途十二阶》最新版(v25)分享二维码海报"""
import qrcode
from PIL import Image, ImageDraw, ImageFont, ImageFilter

URL = "https://jianyangdu3-ux.github.io/xiantu-wordgame/?v=82"
W, H = 1080, 1420
GOLD = (212, 175, 55)
GOLD_LIGHT = (245, 220, 130)
WHITE = (255, 255, 255)
INK = (30, 26, 45)

FONT_TTC = "/System/Library/Fonts/PingFang.ttc"

def font(size, weight=0):
    # PingFang.ttc: 0=regular 1=thin 2=light 3=medium 4=semibold
    return ImageFont.truetype(FONT_TTC, size, index=weight)

# ---------- 背景渐变：墨蓝 -> 深紫 ----------
img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)
top = (18, 22, 46)      # 墨蓝
mid = (36, 26, 66)      # 深紫
bot = (14, 12, 30)      # 夜色
for y in range(H):
    t = y / H
    if t < 0.55:
        k = t / 0.55
        c = tuple(int(top[i] + (mid[i] - top[i]) * k) for i in range(3))
    else:
        k = (t - 0.55) / 0.45
        c = tuple(int(mid[i] + (bot[i] - mid[i]) * k) for i in range(3))
    d.line([(0, y), (W, y)], fill=c)

# ---------- 装饰：星光 ----------
import random
random.seed(42)
for _ in range(90):
    x, y = random.randint(0, W), random.randint(0, H)
    r = random.choice([1, 1, 1, 2, 2, 3])
    a = random.randint(60, 200)
    col = (GOLD_LIGHT[0], GOLD_LIGHT[1], GOLD_LIGHT[2], a)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse([x - r, y - r, x + r, y + r], fill=col)
    img = Image.alpha_composite(img.convert("RGBA"), overlay)

# 底部山影
hill = Image.new("RGBA", (W, H), (0, 0, 0, 0))
hd = ImageDraw.Draw(hill)
hd.polygon([(0, H), (0, 1250), (260, 1160), (520, 1270), (760, 1170), (1080, 1280), (1080, H)], fill=(8, 8, 20, 120))
hd.polygon([(0, H), (0, 1310), (380, 1220), (700, 1320), (1080, 1240), (1080, H)], fill=(5, 5, 14, 160))
img = Image.alpha_composite(img, hill)
img = img.convert("RGB")
d = ImageDraw.Draw(img)

# ---------- 顶部：云纹 + 标题 ----------
f_title = font(96, 4)
f_sub = font(40, 2)
f_url = font(30)
f_note = font(34, 2)
f_badge = font(30, 4)

# 标题金框
def draw_gold_frame(d, box):
    x0, y0, x1, y1 = box
    for i in range(2):
        d.rectangle([x0 + i, y0 + i, x1 - i, y1 - i], outline=tuple(int(c * (1 - i * 0.25)) for c in GOLD), width=2)

title = "仙 途 十 二 阶"
tw = d.textlength(title, font=f_title)
d.text(((W - tw) / 2, 150), title, font=f_title, fill=GOLD_LIGHT)

sub = "考研单词 · 修仙闯关"
sw = d.textlength(sub, font=f_sub)
d.text(((W - sw) / 2, 300), sub, font=f_sub, fill=(200, 195, 220))

# 分隔线
cx = W / 2
d.line([(cx - 300, 396), (cx - 60, 396)], fill=GOLD, width=3)
d.line([(cx + 60, 396), (cx + 300, 396)], fill=GOLD, width=3)
d.ellipse([cx - 12, 384, cx + 12, 408], outline=GOLD, width=3)

# ---------- 二维码卡片 ----------
qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=14, border=3)
qr.add_data(URL)
qr.make(fit=True)
qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
qs = qr_img.size[0]
QR_SIZE = 580
if qs != QR_SIZE:
    qr_img = qr_img.resize((QR_SIZE, QR_SIZE), Image.LANCZOS)

card_w, card_h = 820, 840
card_x, card_y = (W - card_w) // 2, 460
# 卡片阴影
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle([card_x + 10, card_y + 14, card_x + card_w + 10, card_y + card_h + 14], radius=28, fill=(0, 0, 0, 110))
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
img = Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB")
d = ImageDraw.Draw(img)
d.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=24, fill=WHITE)
d.rounded_rectangle([card_x + 8, card_y + 8, card_x + card_w - 8, card_y + card_h - 8], radius=18, outline=GOLD, width=3)

# 二维码居中放卡片内
qox = card_x + (card_w - QR_SIZE) // 2
qoy = card_y + 70
img.paste(qr_img, (qox, qoy))

# 二维码上方小标签
badge = "V 6.22 · 全库覆盖版"
bw = d.textlength(badge, font=f_badge)
d.text(((W - bw) / 2, card_y + 20), badge, font=f_badge, fill=(140, 130, 160))

# 网址
uw = d.textlength(URL, font=f_url)
d.text(((W - uw) / 2, qoy + QR_SIZE + 30), URL, font=f_url, fill=(90, 90, 110))

# 底部提示
note = "手机扫码即玩 · 无需下载 · 建议收藏"
nw = d.textlength(note, font=f_note)
d.text(((W - nw) / 2, card_y + card_h + 40), note, font=f_note, fill=(205, 200, 225))

img.save("/Users/dujianyang/WorkBuddy/2026-08-18-21-11-28/仙途十二阶_扫码玩_v26.png")
print("OK saved")
