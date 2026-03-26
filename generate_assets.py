"""
生成特产互换小程序的图标和启动图
"""
import os
import sys
import io

# 设置 UTF-8 编码输出
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

# 输出目录
OUTPUT_DIR = r"C:\Users\31849\WorkBuddy\20260320155547\specialty-swap\miniprogram\images"
ANDROID_DIR = os.path.join(OUTPUT_DIR, "android")
IOS_DIR = os.path.join(OUTPUT_DIR, "ios")

# 创建输出目录
os.makedirs(ANDROID_DIR, exist_ok=True)
os.makedirs(IOS_DIR, exist_ok=True)

def create_gradient_background(size, color1, color2):
    """创建渐变背景"""
    img = Image.new('RGB', size)
    draw = ImageDraw.Draw(img)
    
    for y in range(size[1]):
        ratio = y / size[1]
        r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
        g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
        b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
        draw.line([(0, y), (size[0], y)], fill=(r, g, b))
    
    return img

def draw_gift_box(draw, center_x, center_y, size, color):
    """绘制礼物盒"""
    box_size = size
    ribbon_width = size // 4
    
    # 盒子主体
    box_x1 = center_x - box_size // 2
    box_y1 = center_y - box_size // 2
    box_x2 = center_x + box_size // 2
    box_y2 = center_y + box_size // 2
    draw.rectangle([box_x1, box_y1, box_x2, box_y2], fill=color, outline=color)
    
    # 横向丝带
    ribbon_y = center_y
    draw.rectangle([box_x1, ribbon_y - ribbon_width // 2, box_x2, ribbon_y + ribbon_width // 2], fill=(255, 107, 53))
    
    # 纵向丝带
    draw.rectangle([center_x - ribbon_width // 2, box_y1, center_x + ribbon_width // 2, box_y2], fill=(255, 107, 53))
    
    # 蝴蝶结
    bow_size = size // 3
    bow_y = box_y1 - bow_size // 2
    
    # 左边蝴蝶结
    draw.ellipse([center_x - bow_size - ribbon_width // 2, bow_y - bow_size // 2,
                  center_x - ribbon_width // 2, bow_y + bow_size // 2], fill=(255, 107, 53))
    
    # 右边蝴蝶结
    draw.ellipse([center_x + ribbon_width // 2, bow_y - bow_size // 2,
                  center_x + bow_size + ribbon_width // 2, bow_y + bow_size // 2], fill=(255, 107, 53))
    
    return box_y2  # 返回盒子底部位置

def draw_exchange_arrows(draw, x1, y1, x2, y2, color, arrow_size):
    """绘制交换箭头"""
    # 上箭头（从左到右上）
    arrow1_start = (x1, y1)
    arrow1_mid = ((x1 + x2) // 2 - arrow_size // 2, y1)
    arrow1_end = (arrow1_mid[0], y1 - arrow_size)
    
    # 简化箭头 - 弯曲箭头
    draw.arc([x1, y1 - arrow_size, x2, y1 + arrow_size], 0, 180, fill=color, width=max(2, arrow_size // 4))
    # 箭头头部
    draw.polygon([
        (x2 - arrow_size // 2, y1 - arrow_size),
        (x2, y1),
        (x2 - arrow_size, y1)
    ], fill=color)

def create_app_icon(size):
    """创建应用图标"""
    # 创建渐变背景（橙红到珊瑚色）
    img = create_gradient_background(size, (255, 87, 34), (255, 138, 101))
    draw = ImageDraw.Draw(img)
    
    # 圆角遮罩
    mask = Image.new('L', size, 0)
    mask_draw = ImageDraw.Draw(mask)
    radius = size[0] // 5
    mask_draw.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    
    # 应用圆角
    output = Image.new('RGBA', size, (0, 0, 0, 0))
    output.paste(img, mask=mask)
    draw = ImageDraw.Draw(output)
    
    # 绘制两个礼物盒和交换箭头
    center_x = size[0] // 2
    center_y = size[1] // 2
    
    box_size = size[0] // 4
    spacing = size[0] // 6
    
    # 左边礼物盒（稍小）
    draw_gift_box(draw, center_x - spacing, center_y, int(box_size * 0.9), (255, 255, 255))
    
    # 右边礼物盒（稍小）
    draw_gift_box(draw, center_x + spacing, center_y, int(box_size * 0.9), (255, 255, 255))
    
    # 交换箭头
    arrow_y = center_y - box_size // 2 - size[0] // 10
    arrow_size = size[0] // 12
    
    # 上弧线箭头
    draw.arc([center_x - spacing - box_size // 4, arrow_y - arrow_size,
              center_x, arrow_y + arrow_size], 200, 340, fill=(255, 255, 255), width=max(2, size[0] // 40))
    
    # 下弧线箭头
    draw.arc([center_x, arrow_y - arrow_size,
              center_x + spacing + box_size // 4, arrow_y + arrow_size], 20, 160, fill=(255, 255, 255), width=max(2, size[0] // 40))
    
    return output

def create_splash_screen(size):
    """创建启动图"""
    # 创建渐变背景
    img = create_gradient_background(size, (255, 87, 34), (255, 138, 101))
    draw = ImageDraw.Draw(img)
    
    # 中间图标区域
    icon_size = min(size) // 3
    icon = create_app_icon((icon_size, icon_size))
    
    # 计算图标位置（屏幕中上部）
    icon_x = (size[0] - icon_size) // 2
    icon_y = size[1] // 3 - icon_size // 2
    
    # 绘制白色圆角矩形背景
    bg_padding = icon_size // 8
    bg_radius = icon_size // 8
    draw.rounded_rectangle(
        [icon_x - bg_padding, icon_y - bg_padding,
         icon_x + icon_size + bg_padding, icon_y + icon_size + bg_padding],
        radius=bg_radius,
        fill=(255, 255, 255)
    )
    
    # 粘贴图标
    img.paste(icon, (icon_x, icon_y), icon)
    
    # 应用名称
    try:
        # 尝试使用系统字体
        font_size = min(size) // 10
        font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", font_size)
    except:
        font = ImageFont.load_default()
    
    text = "互换特产"
    text_y = icon_y + icon_size + icon_size // 2
    
    # 绘制文字阴影
    draw.text((size[0] // 2 + 2, text_y + 2), text, fill=(200, 80, 50), font=font, anchor="mt")
    # 绘制文字
    draw.text((size[0] // 2, text_y), text, fill=(255, 255, 255), font=font, anchor="mt")
    
    # 底部标语
    try:
        slogan_font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", font_size // 2)
    except:
        slogan_font = font
    
    slogan = "发现家乡味道 · 分享地道特产"
    slogan_y = text_y + font_size + font_size // 2
    draw.text((size[0] // 2, slogan_y), slogan, fill=(255, 230, 220), font=slogan_font, anchor="mt")
    
    return img

def main():
    print("🎨 开始生成特产互换小程序图标和启动图...\n")
    
    # ===== Android 图标 =====
    print("📱 生成 Android 图标...")
    android_icons = {
        "hdpi": (72, 72),
        "xhdpi": (96, 96),
        "xxhdpi": (144, 144),
        "xxxhdpi": (192, 192)
    }
    
    for name, size in android_icons.items():
        icon = create_app_icon(size)
        filename = f"icon_{name}.png"
        filepath = os.path.join(ANDROID_DIR, filename)
        icon.save(filepath, "PNG")
        print(f"  ✓ {filename} ({size[0]}x{size[1]})")
    
    # ===== Android 启动图 =====
    print("\n🖼️  生成 Android 启动图...")
    android_splash = {
        "hdpi": (480, 800),
        "xhdpi": (720, 1280),
        "xxhdpi": (1080, 1920)
    }
    
    for name, size in android_splash.items():
        splash = create_splash_screen(size)
        filename = f"splash_{name}.png"
        filepath = os.path.join(ANDROID_DIR, filename)
        splash.save(filepath, "PNG")
        print(f"  ✓ {filename} ({size[0]}x{size[1]})")
    
    # ===== iOS 图标 =====
    print("\n📱 生成 iOS 图标...")
    ios_icons = {
        "mainIcon120": (120, 120),
        "mainIcon180": (180, 180),
        "spotlightIcon80": (80, 80),
        "spotlightIcon120": (120, 120),
        "settingsIcon58": (58, 58),
        "settingsIcon87": (87, 87),
        "notificationIcon40": (40, 40),
        "notificationIcon60": (60, 60),
        "appStore1024": (1024, 1024)
    }
    
    for name, size in ios_icons.items():
        icon = create_app_icon(size)
        filename = f"icon_{name}.png"
        filepath = os.path.join(IOS_DIR, filename)
        icon.save(filepath, "PNG")
        print(f"  ✓ {filename} ({size[0]}x{size[1]})")
    
    # ===== iOS 启动图 =====
    print("\n🖼️  生成 iOS 启动图...")
    # iOS 启动图使用通用尺寸（iPhone X/11/12/13/14/15）
    ios_splash_size = (1170, 2532)
    splash = create_splash_screen(ios_splash_size)
    filename = "splash_custom.png"
    filepath = os.path.join(IOS_DIR, filename)
    splash.save(filepath, "PNG")
    print(f"  ✓ {filename} ({ios_splash_size[0]}x{ios_splash_size[1]})")
    
    print("\n✅ 所有图标和启动图生成完成！")
    print(f"\n📁 输出目录:")
    print(f"  Android: {ANDROID_DIR}")
    print(f"  iOS: {IOS_DIR}")

if __name__ == "__main__":
    main()
