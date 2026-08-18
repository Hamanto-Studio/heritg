import CoreGraphics
import Foundation
import ImageIO
import PhotosUI
import SwiftUI
import UIKit

struct ProfilePhotoAvatar: View {
    let data: Data?
    let initials: String
    let size: CGFloat
    var background: Color = HeritgColor.recessed

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Circle().fill(background)
                    Text(initials)
                        .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
                        .foregroundStyle(HeritgColor.text)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .task(id: data) {
            guard let data else {
                image = nil
                return
            }
            image = await ProfilePhotoProcessor.previewImage(from: data)
        }
    }
}

struct ProfilePhotoEditor: View {
    let personName: String
    @Binding var photoData: Data?

    @State private var pickerItem: PhotosPickerItem?
    @State private var sourceImage: UIImage?
    @State private var isShowingCrop = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 12) {
            ProfilePhotoAvatar(
                data: photoData,
                initials: personName.prefix(1).uppercased(),
                size: 104,
                background: HeritgColor.recessed
            )
            .overlay(Circle().stroke(HeritgColor.line, lineWidth: 1))

            HStack(spacing: 10) {
                PhotosPicker(
                    selection: $pickerItem,
                    matching: .images,
                    preferredItemEncoding: .current
                ) {
                    Label(photoData == nil ? "Add photo" : "Change photo", systemImage: "photo")
                }
                .buttonStyle(HeritgButtonStyle(variant: .secondary))
                .accessibilityIdentifier("person.photo.choose")

                if photoData != nil {
                    Button("Remove photo", systemImage: "trash") {
                        photoData = nil
                    }
                    .labelStyle(.iconOnly)
                    .buttonStyle(HeritgIconButtonStyle())
                    .accessibilityLabel("Remove photo")
                    .accessibilityIdentifier("person.photo.remove")
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(HeritgColor.danger)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("person.photo.error")
            }
        }
        .frame(maxWidth: .infinity)
        .task(id: pickerItem) {
            await loadSelectedPhoto()
        }
        .sheet(isPresented: $isShowingCrop) {
            if let sourceImage {
                CropPhotoSheet(image: sourceImage) { croppedData in
                    photoData = croppedData
                    isShowingCrop = false
                }
            }
        }
    }

    private func loadSelectedPhoto() async {
        guard let pickerItem else { return }
        do {
            guard let data = try await pickerItem.loadTransferable(type: Data.self),
                  let image = await ProfilePhotoProcessor.editingImage(from: data) else {
                throw ProfilePhotoError.invalidImage
            }
            try Task.checkCancellation()
            sourceImage = image
            errorMessage = nil
            isShowingCrop = true
            self.pickerItem = nil
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct CropPhotoSheet: View {
    let image: UIImage
    let onDone: (Data) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var zoom: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var dragStartOffset: CGSize = .zero
    @State private var zoomStart: CGFloat = 1
    @State private var currentCropSide: CGFloat = 0
    @State private var currentBaseScale: CGFloat = 1
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            GeometryReader { proxy in cropContent(for: proxy.size) }
            .navigationTitle("Crop photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Use photo") {
                        saveCrop()
                    }
                    .disabled(errorMessage != nil)
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func cropContent(for size: CGSize) -> some View {
        let cropSide = max(min(size.width - 32, size.height - 250), 120)
        let baseScale = max(cropSide / max(image.size.width, 1), cropSide / max(image.size.height, 1))
        let renderedSize = CGSize(width: image.size.width * baseScale * zoom, height: image.size.height * baseScale * zoom)

        return VStack(spacing: 16) {
            Text("Drag to reposition, then adjust the zoom until the photo looks right.")
                .font(.subheadline)
                .foregroundStyle(HeritgColor.subtleText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            ZStack {
                HeritgColor.recessed
                Image(uiImage: image)
                    .resizable()
                    .frame(width: renderedSize.width, height: renderedSize.height)
                    .offset(clampedOffset(offset, cropSide: cropSide, renderedSize: renderedSize))
                    .gesture(dragGesture(cropSide: cropSide, renderedSize: renderedSize))
                    .simultaneousGesture(zoomGesture(cropSide: cropSide, baseScale: baseScale))
            }
            .frame(width: cropSide, height: cropSide)
            .clipShape(.rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(.white.opacity(0.9), lineWidth: 2)
                    .allowsHitTesting(false)
            }
            .shadow(color: .black.opacity(0.12), radius: 16, y: 8)
            .accessibilityLabel("Square photo crop")
            .accessibilityValue("Zoom \(Int(zoom * 100)) percent")
            .accessibilityZoomAction { direction in
                let change: CGFloat = direction.direction == .zoomIn ? 0.25 : -0.25
                zoom = (zoom + change).clamped(to: 1...4)
                offset = clampedOffset(offset, cropSide: cropSide, renderedSize: renderedSize)
            }

            VStack(spacing: 12) {
                HStack {
                    Text("Zoom")
                        .font(.headline)
                        .foregroundStyle(HeritgColor.text)
                    Spacer()
                    Text("\(Int(zoom * 100))%")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(HeritgColor.subtleText)
                }

                HStack(spacing: 12) {
                    Image(systemName: "minus.magnifyingglass")
                        .foregroundStyle(HeritgColor.subtleText)
                        .accessibilityHidden(true)
                    Slider(value: $zoom, in: 1...4) { Text("Zoom") } onEditingChanged: { isEditing in
                        if !isEditing { zoomStart = zoom }
                    }
                    .accessibilityValue("\(Int(zoom * 100)) percent")
                    Image(systemName: "plus.magnifyingglass")
                        .foregroundStyle(HeritgColor.subtleText)
                        .accessibilityHidden(true)
                }

                Button("Reset photo position", systemImage: "arrow.counterclockwise") {
                    resetCrop()
                }
                .buttonStyle(HeritgButtonStyle(variant: .secondary))
                .accessibilityIdentifier("person.photo.crop.reset")
            }
            .padding(16)
            .background(HeritgColor.base)
            .clipShape(.rect(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(HeritgColor.line, lineWidth: 1)
            }
            .padding(.horizontal, 16)

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(HeritgColor.danger)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.top, 16)
        .background(HeritgColor.canvas)
        .onAppear {
            currentCropSide = cropSide
            currentBaseScale = baseScale
        }
        .onChange(of: cropSide) { newValue in
            currentCropSide = newValue
            currentBaseScale = baseScale
        }
    }

    private func resetCrop() {
        zoom = 1
        zoomStart = 1
        offset = .zero
        dragStartOffset = .zero
        errorMessage = nil
    }

    private func dragGesture(cropSide: CGFloat, renderedSize: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in
                offset = CGSize(
                    width: dragStartOffset.width + value.translation.width,
                    height: dragStartOffset.height + value.translation.height
                )
            }
            .onEnded { _ in
                offset = clampedOffset(offset, cropSide: cropSide, renderedSize: renderedSize)
                dragStartOffset = offset
            }
    }

    private func zoomGesture(cropSide: CGFloat, baseScale: CGFloat) -> some Gesture {
        MagnificationGesture()
            .onChanged { value in
                if abs(value - 1) < 0.001 {
                    zoomStart = zoom
                }
                zoom = (zoomStart * value).clamped(to: 1...4)
            }
            .onEnded { _ in
                zoomStart = zoom
                let renderedSize = CGSize(
                    width: image.size.width * baseScale * zoom,
                    height: image.size.height * baseScale * zoom
                )
                offset = clampedOffset(offset, cropSide: cropSide, renderedSize: renderedSize)
                dragStartOffset = offset
            }
    }

    private func clampedOffset(
        _ value: CGSize,
        cropSide: CGFloat,
        renderedSize: CGSize
    ) -> CGSize {
        CGSize(
            width: value.width.clamped(to: -(max(renderedSize.width - cropSide, 0) / 2)...max(renderedSize.width - cropSide, 0) / 2),
            height: value.height.clamped(to: -(max(renderedSize.height - cropSide, 0) / 2)...max(renderedSize.height - cropSide, 0) / 2)
        )
    }

    private func saveCrop() {
        let totalScale = currentBaseScale * zoom
        guard totalScale > 0, currentCropSide > 0 else {
            errorMessage = ProfilePhotoError.cropFailed.localizedDescription
            return
        }
        let renderedSize = CGSize(
            width: image.size.width * totalScale,
            height: image.size.height * totalScale
        )
        let visibleOffset = clampedOffset(
            offset,
            cropSide: currentCropSide,
            renderedSize: renderedSize
        )
        let side = min(image.size.width, image.size.height, currentCropSide / totalScale)
        let proposedX = image.size.width / 2 - visibleOffset.width / totalScale - side / 2
        let proposedY = image.size.height / 2 - visibleOffset.height / totalScale - side / 2
        let x = proposedX.clamped(to: 0...max(image.size.width - side, 0))
        let y = proposedY.clamped(to: 0...max(image.size.height - side, 0))
        let rect = CGRect(x: x, y: y, width: side, height: side)

        guard let data = ProfilePhotoProcessor.crop(image: image, rect: rect) else {
            errorMessage = ProfilePhotoError.cropFailed.localizedDescription
            return
        }
        onDone(data)
    }
}

enum ProfilePhotoProcessor {
    static func editingImage(from data: Data) async -> UIImage? {
        await Task.detached(priority: .userInitiated) {
            let options: [CFString: Any] = [
                kCGImageSourceShouldCache: false,
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 2048,
                kCGImageSourceShouldCacheImmediately: true,
            ]
            guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
                return nil
            }
            return UIImage(cgImage: image)
        }.value
    }

    nonisolated static func preview(from data: Data) -> UIImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 256,
        ]
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: image)
    }

    static func previewImage(from data: Data) async -> UIImage? {
        await Task.detached(priority: .userInitiated) {
            preview(from: data)
        }.value
    }

    static func crop(image: UIImage, rect: CGRect) -> Data? {
        guard let cgImage = image.cgImage, image.size.width > 0, image.size.height > 0 else {
            return nil
        }
        let pixelRect = CGRect(
            x: rect.minX * CGFloat(cgImage.width) / image.size.width,
            y: rect.minY * CGFloat(cgImage.height) / image.size.height,
            width: rect.width * CGFloat(cgImage.width) / image.size.width,
            height: rect.height * CGFloat(cgImage.height) / image.size.height
        ).integral
        guard let cropped = cgImage.cropping(to: pixelRect) else { return nil }
        let output = UIImage(cgImage: cropped)
        return output.jpegData(compressionQuality: 0.85)
    }
}

private enum ProfilePhotoError: LocalizedError {
    case invalidImage
    case cropFailed

    var errorDescription: String? {
        switch self {
        case .invalidImage:
            String(
                localized: "The selected photo could not be opened.",
                locale: AppLanguage.selectedLocale
            )
        case .cropFailed:
            String(localized: "The photo could not be cropped.", locale: AppLanguage.selectedLocale)
        }
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
