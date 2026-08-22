# -*- coding: utf-8 -*-
"""仙侠水墨风二维码：《仙途十二阶》v25 分享码"""
import qrcode, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

URL = "https://jianyangdu3-ux.github.io/xiantu-wordgame/?v=81"
W, H = 1086, 1448
INK = (42, 40, 38)          # 墨色
MOSS = (24, 61, 54)         # 深墨绿 #183D36
MOSS2 = (69, 185, 172)      # 玉青 #45B9AC
CINNABAR = (216, 50, 47)    # 朱红 #D8322F
RICE = (247, 244, 236)      # 宣纸米白 #F7F4EC

F_TITLE = "/System/Library/Fonts/Supplemental/Songti.ttc"
F_BODY = "/System/Library/Fonts/PingFang.ttc"

def font(path, size, idx=0):
    return ImageFont.truetype(path, size, index=idx)

random.seed(7)

# ---------- 宣纸背景 + 淡墨纹理 ----------
img = Image.new("RGB", (W, H), RICE)
tex = Image.new("RGBA", (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(tex)
for _ in range(1400):
    x, y = random.randint(0, W), random.randint(0, H)
    r = random.choice([1, 1, 1, 2, 2, 3, 4])
    a = random.randint(6, 22)
    td.ellipse([x - r, y - r, x + r, y + r], fill=(60, 55, 50, a))
# 大晕染
for _ in range(6):
    x, y = random.randint(0, W), random.randint(0, H)
    r = random.randint(90, 200)
    bl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bl)
    bd.ellipse([x - r, y - r, x + r, y + r], fill=(70, 64, 56, 9))
    bl = bl.filter(ImageFilter.GaussianBlur(60))
    tex = Image.alpha_composite(tex, bl)
img = Image.alpha_composite(img.convert("RGBA"), tex).convert("RGB")
d = ImageDraw.Draw(img)

# ---------- 祥云（顶部两侧 + 二维码左右）----------
# 祥云用椭圆叠加，画在独立图层再合成
clouds = Image.new("RGBA", (W, H), (0, 0, 0, 0))
cd = ImageDraw.Draw(clouds)

def cloud(dr, cx, cy, s, alpha):
    col = (45, 42, 40, alpha)
    dr.ellipse([cx - 1.6 * s, cy - 0.7 * s, cx + 1.6 * s, cy + 0.7 * s], fill=col)
    dr.ellipse([cx - 1.1 * s, cy - 1.1 * s, cx + 1.1 * s, cy + 1.1 * s], fill=col)
    dr.ellipse([cx - 0.4 * s, cy - 1.3 * s, cx + 0.4 * s, cy + 1.3 * s], fill=col)
    dr.ellipse([cx - 1.9 * s, cy - 0.35 * s, cx + 1.9 * s, cy + 0.35 * s], fill=col)

cloud(cd, 120, 110, 34, 48)
cloud(cd, 966, 92, 30, 42)
cloud(cd, 100, 560, 26, 38)
cloud(cd, 986, 610, 28, 38)
cloud(cd, 150, 1240, 26, 34)
cloud(cd, 950, 1180, 24, 34)
img = Image.alpha_composite(img.convert("RGBA"), clouds).convert("RGB")
d = ImageDraw.Draw(img)

# ---------- 顶部：标题 + 印章 ----------
f_main = font(F_TITLE, 92, 1)
f_sub = font(F_BODY, 38, 2)
f_slogan = font(F_TITLE, 42, 1)
f_url = font(F_BODY, 27, 0)

title = "仙途十二阶"
tw = d.textlength(title, font=f_main)
tx = (W - tw) / 2
d.text((tx, 168), title, font=f_main, fill=INK)

# 标题左右小墨点装饰
d.ellipse([tx - 46, 238, tx - 26, 258], outline=(45, 42, 40), width=2)
d.ellipse([tx + tw + 26, 238, tx + tw + 46, 258], outline=(45, 42, 40), width=2)

# 朱红印章（标题右侧）
seal_x, seal_y, seal_s = tx + tw + 70, 150, 92
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(sh)
sd.rounded_rectangle([seal_x, seal_y, seal_x + seal_s, seal_y + seal_s], radius=10, fill=(CINNABAR[0], CINNABAR[1], CINNABAR[2], 235))
sd.rounded_rectangle([seal_x + 7, seal_y + 7, seal_x + seal_s - 7, seal_y + seal_s - 7], radius=7,
                     outline=(255, 240, 235, 220), width=2)
img = Image.alpha_composite(img.convert("RGBA"), sh).convert("RGB")
d = ImageDraw.Draw(img)
sf = font(F_TITLE, 56, 1)
sw_ = d.textlength("仙", font=sf)
d.text((seal_x + (seal_s - sw_) / 2, seal_y + 12), "仙", font=sf, fill=(250, 245, 238))

# 副标题
sub = "考研单词 · 修仙闯关"
suw = d.textlength(sub, font=f_sub)
d.text(((W - suw) / 2, 330), sub, font=f_sub, fill=MOSS2)

# 分隔纹
cx = W / 2
for i, (gap, off) in enumerate([(150, 0), (90, 26)]):
    pass
d.line([(cx - 260, 420), (cx - 40, 420)], fill=(45, 42, 40), width=2)
d.line([(cx + 40, 420), (cx + 260, 420)], fill=(45, 42, 40), width=2)
d.ellipse([cx - 8, 412, cx + 8, 428], outline=(45, 42, 40), width=2)

# ---------- 二维码（墨绿圆点码）----------
qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=1, border=0)
qr.add_data(URL)
qr.make(fit=True)
mat = qr.get_matrix()
n = len(mat)
MOD = 13
QS = n * MOD
QX = (W - QS) // 2
QY = 480

def draw_finder(dr, fx, fy, col):
    """标准定位角：外框+内框+中心点"""
    s = MOD * 7
    dr.rectangle([fx, fy, fx + s - 1, fy + s - 1], fill=col)
    dr.rectangle([fx + MOD, fy + MOD, fx + s - 1 - MOD, fy + s - 1 - MOD], fill=RICE)
    dr.rectangle([fx + MOD * 2, fy + MOD * 2, fx + s - 1 - MOD * 2, fy + s - 1 - MOD * 2], fill=col)

for y in range(n):
    for x in range(n):
        if not mat[y][x]:
            continue
        px, py = QX + x * MOD, QY + y * MOD
        # 三个定位角区域保持标准方形
        if (x < 8 and y < 8) or (x >= n - 8 and y < 8) or (x < 8 and y >= n - 8):
            continue
        # 圆点码点，画实心椭圆
        d.ellipse([px + 1, py + 1, px + MOD - 2, py + MOD - 2], fill=MOSS)
# 定位角最后画（盖住数据点）
draw_finder(d, QX, QY, MOSS)
draw_finder(d, QX + (n - 7) * MOD, QY, MOSS)
draw_finder(d, QX, QY + (n - 7) * MOD, MOSS)

# 二维码外淡墨细框 + 玉青点缀线
pad = 28
d.rectangle([QX - pad, QY - pad, QX + QS + pad, QY + QS + pad], outline=(45, 42, 40, 120), width=2)
d.rectangle([QX - pad - 6, QY - pad - 6, QX + QS + pad + 6, QY + QS + pad + 6], outline=(69, 185, 172, 100), width=1)

# ---------- 底部水墨山影 ----------
m1 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
md = ImageDraw.Draw(m1)
md.polygon([(0, H), (0, 1290), (240, 1205), (480, 1315), (700, 1215), (940, 1330), (1086, 1250), (1086, H)], fill=(24, 61, 54, 90))
md.polygon([(0, H), (0, 1340), (360, 1260), (640, 1360), (900, 1280), (1086, 1355), (1086, H)], fill=(24, 61, 54, 150))
m1 = m1.filter(ImageFilter.GaussianBlur(2))
img = Image.alpha_composite(img.convert("RGBA"), m1).convert("RGB")
d = ImageDraw.Draw(img)

# 山间一点舟影（小装饰）
d.ellipse([500, 1262, 570, 1282], fill=(45, 42, 40, 120))

# ---------- 标语 + 网址 ----------
slogan = "以词入道 · 以战修真"
sw_ = d.textlength(slogan, font=f_slogan)
d.text(((W - sw_) / 2, 1362), slogan, font=f_slogan, fill=(55, 52, 48))

img.save("/Users/dujianyang/WorkBuddy/2026-08-18-21-11-28/仙途十二阶_仙侠二维码.png")
print("OK", n, "modules,", n * MOD, "px")
