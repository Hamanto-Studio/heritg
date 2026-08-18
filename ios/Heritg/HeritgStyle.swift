import SwiftUI

enum HeritgColor {
    static let canvas = adaptive(light: 0xF7F3EC, dark: 0x29251F)
    static let treeCanvas = adaptive(light: 0xF5F5F3, dark: 0x29251F)
    static let base = adaptive(light: 0xFFFDF8, dark: 0x342F28)
    static let selectedAvatar = adaptive(light: 0xF3EADF, dark: 0x463E33)
    static let elevated = adaptive(light: 0xFFFAF2, dark: 0x3B352C)
    static let recessed = adaptive(light: 0xEDE5D8, dark: 0x463E33)
    static let text = adaptive(light: 0x302B25, dark: 0xFFF8EE)
    static let subtleText = adaptive(light: 0x796F63, dark: 0xC8BDAE)
    static let line = adaptive(light: 0xD8CCBC, dark: 0x5B5043)
    static let brand = adaptive(light: 0xA8875B, dark: 0xD0B486)
    static let add = adaptive(light: 0x7E9B63, dark: 0xA9C28A)
    static let danger = adaptive(light: 0xB95C4B, dark: 0xE08B78)

    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

enum HeritgButtonVariant {
    case primary
    case secondary
    case ghost
    case destructive
}

struct HeritgButtonStyle: ButtonStyle {
    let variant: HeritgButtonVariant
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.body, design: .rounded, weight: .semibold))
            .foregroundStyle(foregroundColor)
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
            .background(backgroundColor.opacity(configuration.isPressed ? 0.75 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                if variant == .secondary {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(HeritgColor.line, lineWidth: 1)
                }
            }
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var foregroundColor: Color {
        switch variant {
        case .primary, .destructive: .white
        case .secondary, .ghost: HeritgColor.text
        }
    }

    private var backgroundColor: Color {
        switch variant {
        case .primary: HeritgColor.brand
        case .secondary: HeritgColor.base
        case .ghost: .clear
        case .destructive: HeritgColor.danger
        }
    }
}

struct HeritgIconButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(HeritgColor.text)
            .frame(
                width: max(48, TreeVisualMetrics.minimumTapTarget),
                height: max(48, TreeVisualMetrics.minimumTapTarget)
            )
            .background(HeritgColor.base.opacity(configuration.isPressed ? 0.72 : 0.96))
            .clipShape(Circle())
            .overlay(Circle().stroke(HeritgColor.line, lineWidth: 1))
            .shadow(color: .black.opacity(0.07), radius: 10, y: 4)
            .opacity(isEnabled ? 1 : 0.42)
    }
}
