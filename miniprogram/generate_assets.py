#!/usr/bin/env python3
"""
图标和启动图批量生成工具
用于将基础图标/启动图调整为iOS和Android所需的各种尺寸
"""

import os
from PIL import Image

# 工作目录
WORKSPACE = r"c:\Users\31849\WorkBuddy\20260320155547\specialty-swap\miniprogram\images"

# iOS 图标尺寸配置
IOS_ICONS = {
    "ios/icon_appStore1024.png": (1024, 1024),
    "ios/icon_mainIcon180.png": (180, 180),
    "ios/icon_mainIcon120.png": (120, 120),
    "ios/icon_notificationIcon60.png": (60, 60),
    "ios/icon_notificationIcon40.png": (40, 40),
    "ios/icon_settingsIcon87.png": (87, 87),
    "ios/icon_settingsIcon58.png": (58, 58),
    "ios/icon_spotlightIcon120.png": (120, 120),
    "ios/icon_spotlightIcon80.png": (80, 80),
}

# Android 图标尺寸配置（直接放在 images 目录）
ANDROID_ICONS = {
    "android-icon-48.png": (48, 48),
    "android-icon-72.png": (72, 72),
    "android-icon-96.png": (96, 96),
    "android-icon-144.png": (144, 144),
    "android-icon-192.png": (192, 192),
}

# Android 启动图尺寸配置（直接放在 images 目录）
ANDROID_SPLASH = {
    "android-splash-480x320.png": (480, 320),
    "android-splash-800x480.png": (800, 480),
    "android-splash-1280x720.png": (1280, 720),
    "android-splash-1920x1080.png": (1920, 1080),
    "android-splash-2560x1440.png": (2560, 1440),
}


def resize_image(source_path, target_path, size):
    """调整图片尺寸"""
    try:
        img = Image.open(source_path)
        
        # 对于启动图，保持宽高比
        if "splash" in target_path.lower():
            img = img.resize(size, Image.Resampling.LANCZOS)
        else:
            # 对于图标，强制正方形
            img = img.resize(size, Image.Resampling.LANCZOS)
        
        # 确保目标目录存在
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        
        # 保存图片
        img.save(target_path, "PNG")
        print(f"[OK] 生成: {target_path} ({size[0]}x{size[1]})")
        return True
    except Exception as e:
        print(f"[X] 错误 {target_path}: {e}")
        return False


def generate_icons(source_icon):
    """生成所有尺寸的图标"""
    print("\n=== 生成 iOS 图标 ===")
    for relative_path, size in IOS_ICONS.items():
        target_path = os.path.join(WORKSPACE, relative_path)
        resize_image(source_icon, target_path, size)
    
    print("\n=== 生成 Android 图标 ===")
    for relative_path, size in ANDROID_ICONS.items():
        target_path = os.path.join(WORKSPACE, relative_path)
        resize_image(source_icon, target_path, size)


def generate_splash(source_splash):
    """生成所有尺寸的启动图"""
    print("\n=== 生成 iOS 启动图 ===")
    target_path = os.path.join(WORKSPACE, "ios/splash_custom.png")
    # iOS 启动图推荐尺寸
    resize_image(source_splash, target_path, (2048, 1366))
    
    print("\n=== 生成 Android 启动图 ===")
    for relative_path, size in ANDROID_SPLASH.items():
        target_path = os.path.join(WORKSPACE, relative_path)
        resize_image(source_splash, target_path, size)


def main():
    print("=" * 60)
    print("特产互换小程序 - 图标和启动图批量生成工具")
    print("=" * 60)
    
    # 检查源文件
    source_icon = os.path.join(WORKSPACE, "app-icon-coconut.png")
    source_splash = os.path.join(WORKSPACE, "splash-screen-new.png")
    
    print("\n需要的源文件：")
    print(f"1. 应用图标: {source_icon}")
    print(f"2. 启动图: {source_splash}")
    
    # 检查文件是否存在
    icon_exists = os.path.exists(source_icon)
    splash_exists = os.path.exists(source_splash)
    
    print("\n文件状态：")
    print(f"应用图标: {'[OK] 存在' if icon_exists else '[X] 不存在'}")
    print(f"启动图: {'[OK] 存在' if splash_exists else '[X] 不存在'}")
    
    if not icon_exists and not splash_exists:
        print("\n请先生成以下两个图片文件：")
        print("\n1. 应用图标 (app-icon-coconut.png)")
        print("   提示词: 应用图标，卡通风格，海南椰子，鲜绿色椰子，叶子装饰，")
        print("          可爱萌系风格，简洁干净的背景，适合作为APP图标使用，")
        print("          高饱和度，扁平化设计，适合圆角裁剪，主体居中，留白充足")
        print("   推荐尺寸: 1024x1024px")
        
        print("\n2. 启动图 (splash-screen-new.png)")
        print("   提示词: 启动图，一男一女两个年轻人，面带微笑，")
        print("          手里拿着中国特色特产相互交换，开心的氛围，")
        print("          现代简约插画风格，温馨友好，适合作为APP启动页，")
        print("          横向构图，明亮色调，清新自然")
        print("   推荐尺寸: 2048x1366px")
        
        print("\n推荐使用的AI绘图工具：")
        print("- 通义万相: https://tongyi.aliyun.com/wanxiang/")
        print("- 文心一格: https://yige.baidu.com/")
        print("- Midjourney")
        print("- DALL-E 3")
        
        print("\n生成图片后，将图片保存到以下位置：")
        print(f"- 应用图标: {source_icon}")
        print(f"- 启动图: {source_splash}")
        print("\n然后重新运行此脚本，即可自动生成所有尺寸的图标和启动图。")
        return
    
    # 生成图标
    if icon_exists:
        print("\n" + "=" * 60)
        print("开始生成图标...")
        print("=" * 60)
        generate_icons(source_icon)
    else:
        print("\n跳过图标生成（源文件不存在）")
    
    # 生成启动图
    if splash_exists:
        print("\n" + "=" * 60)
        print("开始生成启动图...")
        print("=" * 60)
        generate_splash(source_splash)
    else:
        print("\n跳过启动图生成（源文件不存在）")
    
    print("\n" + "=" * 60)
    print("完成！")
    print("=" * 60)


if __name__ == "__main__":
    main()
