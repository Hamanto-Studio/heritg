import SwiftUI
import UIKit

struct TreeCanvasActionHitTarget: Identifiable {
    enum Kind {
        case add
        case edit
    }

    let identifier: String
    let personID: String
    let kind: Kind
    let label: String
    let center: CGPoint
    let size: CGFloat

    var id: String { identifier }
}

struct TreeCanvasActionButton: UIViewRepresentable {
    let target: TreeCanvasActionHitTarget
    let action: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(action: action)
    }

    func makeUIView(context: Context) -> UIButton {
        let button = UIButton(type: .custom)
        button.addTarget(
            context.coordinator,
            action: #selector(Coordinator.performAction),
            for: .touchUpInside
        )
        return button
    }

    func updateUIView(_ button: UIButton, context: Context) {
        context.coordinator.action = action
        button.accessibilityIdentifier = target.identifier
        button.accessibilityLabel = target.label
        button.accessibilityTraits = .button
        button.isAccessibilityElement = true
    }

    final class Coordinator: NSObject {
        var action: () -> Void

        init(action: @escaping () -> Void) {
            self.action = action
        }

        @objc func performAction() {
            action()
        }
    }
}
