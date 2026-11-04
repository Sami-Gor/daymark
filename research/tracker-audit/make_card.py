#!/usr/bin/env python3
import json
from PIL import Image, ImageDraw, ImageFont

S = 2
W, H = 1080, 1350
BG = (250, 249, 246)
INK = (28, 27, 25)
MUTED = (107, 104, 98)
BAR = (203, 199, 190)
GREEN = (47, 111, 79)
BAND = (233, 240, 235)

DISPLAY = {
    "com.wunderground.android.weather": "Weather Underground",
    "com.droid27.transparentclockweather": "Transparent clock & weather",
    "de.wetteronline.wetterapp": "Weather & Radar",
    "com.mg.android": "WeatherPro",
    "uk.gov.metoffice.weather.android": "Met Office",
    "de.dwd.warnapp": "WarnWetter",
    "com.google.android.apps.weather": "Pixel Weather",
    "org.breezyweather": "Breezy Weather",
    "no.nrk.yr": "Yr",
    "mobi.lockdown.weather": "Today Weather",
    "com.handmark.expressweather": "1Weather",
    "com.acmeaom.android.myradar": "MyRadar",
    "aplicacion.tiempo": "Meteored",
    "yo.app.free": "YoWindow",
    "com.lucky_apps.RainViewer": "RainViewer",
    "com.meteoblue.droid": "meteoblue",
    "com.weather.Weather": "The Weather Channel",
    "com.aws.android": "WeatherBug",
    "com.accuweather.android": "AccuWeather",
    "com.windyty.android": "Windy.com",
}

F = "/System/Library/Fonts/Supplemental/"
def font(name, size): return ImageFont.truetype(F + name, int(size * S))
serif_b = lambda s: font("Georgia Bold.ttf", s)
sans = lambda s: font("Arial.ttf", s)
sans_b = lambda s: font("Arial Bold.ttf", s)

apps = json.load(open("raw.json"))
for a in apps:
    a["name"] = DISPLAY.get(a["package"], a["app"])
    if a["tracker_count"] is None:
        a["tracker_count"] = len(a.get("trackers", []))
apps.sort(key=lambda x: (-x["tracker_count"], x["name"]))
rows = [(a["name"], a["tracker_count"]) for a in apps] + [("Daymark*", 0)]

img = Image.new("RGB", (W * S, H * S), BG)
d = ImageDraw.Draw(img)
m = 64

d.text((m * S, 58 * S), "PRIVACY AUDIT  ·  ANDROID WEATHER APPS", font=sans_b(20), fill=GREEN)
d.text(((W - m) * S, 58 * S), "DAYMARK", font=sans_b(20), fill=GREEN, anchor="ra")

d.text((m * S, 96 * S), "20 weather apps.", font=serif_b(74), fill=INK)
d.text((m * S, 188 * S), "141 trackers.", font=serif_b(74), fill=GREEN)
d.text((m * S, 288 * S), "Median 4.5 per app. At least 17 of 20 list the ad-ID permission.", font=sans(26), fill=INK)
d.text((m * S, 330 * S), "Daymark source review: no recognised tracker SDK identified.", font=sans_b(23), fill=INK)
d.text((m * S, 358 * S), "Daymark was not subjected to an Exodus APK scan.", font=sans(20), fill=MUTED)
d.line([(m * S, 394 * S), ((W - m) * S, 394 * S)], fill=(225, 221, 213), width=1 * S)

top = 418
step = 39.0
bar_h = 18
left_label = 436
bar_x = 456
maxw = 452
maxv = max(v for _, v in rows) or 1

for i, (name, v) in enumerate(rows):
    y = top + i * step
    mid = (y + bar_h / 2) * S
    is_dm = name == "Daymark"
    if is_dm:
        d.rounded_rectangle([(40) * S, (y - 16) * S, (W - 40) * S, (y + bar_h + 16) * S], radius=11 * S, fill=BAND)
    d.text((left_label * S, mid), name, font=(sans_b(24) if is_dm else sans(24)),
           fill=INK, anchor="rm")
    w = max(3, v / maxv * maxw)
    d.rounded_rectangle([bar_x * S, y * S, (bar_x + w) * S, (y + bar_h) * S], radius=4 * S,
                        fill=(GREEN if is_dm else BAR))
    d.text(((bar_x + w + 14) * S, mid), str(v), font=(sans_b(24) if is_dm else sans_b(24)),
           fill=(GREEN if is_dm else INK), anchor="lm")

d.text((m * S, 1246 * S), "Daymark declares 5 permissions. The Met Office app declares 35.", font=sans(22), fill=INK)
d.text((m * S, 1272 * S), "Source: Exodus Privacy static APK scans for the 20 applications.", font=sans(16), fill=MUTED)
d.text((m * S, 1296 * S), "Daymark* is a source inspection, not an Exodus APK scan.", font=sans(16), fill=MUTED)
d.text((m * S, 1318 * S), "Tracker signatures are not proof of activity; recovered permission names are partial.", font=sans(14), fill=MUTED)

img = img.resize((W, H), Image.LANCZOS)
img.save("audit-card.png", optimize=True)
print("saved audit-card.png", img.size)
