import CoreGraphics
import Foundation
import SwiftUI
import Testing
import UIKit
@testable import HERITG

@MainActor
struct TreeConnectionPlanTests {
    @Test func siblingsWithTheSameParentsUseOneFamilyRoute() {
        let layout = makeLayout(
            positions: [
                "parent-a": CGPoint(x: -130, y: 0),
                "parent-b": CGPoint(x: 130, y: 0),
                "child-a": CGPoint(x: -260, y: 260),
                "child-b": CGPoint(x: 0, y: 260),
                "child-c": CGPoint(x: 260, y: 260),
            ],
            parentPairs: [
                ("parent-a", "child-a"), ("parent-b", "child-a"),
                ("parent-a", "child-b"), ("parent-b", "child-b"),
                ("parent-a", "child-c"), ("parent-b", "child-c"),
            ]
        )

        let plan = TreeConnectionPlan.make(from: layout)

        #expect(plan.families.count == 1)
        #expect(Set(plan.families[0].parentIDs) == ["parent-a", "parent-b"])
        #expect(Set(plan.families[0].childIDs) == ["child-a", "child-b", "child-c"])
        #expect(plan.nonParentEdges.isEmpty)
    }

    @Test func oneParentWithMultipleFamiliesGetsDistinctPortsAndTracks() {
        let layout = makeLayout(
            positions: [
                "shared": CGPoint(x: 0, y: 0),
                "partner-a": CGPoint(x: -260, y: 0),
                "partner-b": CGPoint(x: 260, y: 0),
                "child-a": CGPoint(x: -130, y: 260),
                "child-b": CGPoint(x: 130, y: 260),
            ],
            parentPairs: [
                ("shared", "child-a"), ("partner-a", "child-a"),
                ("shared", "child-b"), ("partner-b", "child-b"),
            ]
        )

        let plan = TreeConnectionPlan.make(from: layout)
        let sharedPorts = plan.families.compactMap { family -> CGFloat? in
            guard let index = family.parentIDs.firstIndex(of: "shared") else { return nil }
            return family.parentPorts[index].x
        }

        #expect(plan.families.count == 2)
        #expect(Set(sharedPorts).count == 2)
        #expect(Set(plan.families.map(\.branchOffset)).count == 2)
    }

    @Test func familyRoutesExposeRealJunctionsInsideTheirBounds() {
        let parents = [CGPoint(x: -100, y: 0), CGPoint(x: 100, y: 0)]
        let children = [CGPoint(x: -200, y: 260), CGPoint(x: 200, y: 260)]
        let path = TreeConnector.familyPath(
            parents: parents,
            children: children,
            avatarRadius: TreeVisualMetrics.avatarRadius,
            scale: 1
        )
        let junctions = TreeConnector.familyJunctionPoints(
            parents: parents,
            children: children,
            avatarRadius: TreeVisualMetrics.avatarRadius,
            scale: 1
        )

        #expect(junctions.count == 2)
        #expect(junctions.allSatisfy(path.boundingRect.contains))
        #expect(junctions[0].y < junctions[1].y)
    }

    @Test func connectionBoundsIncludeOffscreenBranches() {
        let layout = makeLayout(
            positions: [
                "parent": CGPoint(x: 0, y: 0),
                "left-child": CGPoint(x: -780, y: 260),
                "right-child": CGPoint(x: 780, y: 260),
            ],
            parentPairs: [("parent", "left-child"), ("parent", "right-child")]
        )

        let bounds = TreeConnectionPlan.make(from: layout).connectorBounds

        #expect(bounds.minX == -780)
        #expect(bounds.maxX == 780)
        #expect(bounds.maxY == 228)
    }

    @Test func hidingRelationshipLabelsMovesParentConnectorsUp() {
        let layout = makeLayout(
            positions: [
                "parent": CGPoint(x: 0, y: 0),
                "child": CGPoint(x: 0, y: 260),
            ],
            parentPairs: [("parent", "child")]
        )

        let selected = TreeConnectionPlan.make(from: layout, showsRelationshipLabels: true)
        let unselected = TreeConnectionPlan.make(from: layout, showsRelationshipLabels: false)

        #expect(selected.families[0].segments[0].start.y == 84)
        #expect(unselected.families[0].segments[0].start.y == 64)
    }

    @Test func exportRendererUsesTheSharedRoutePlan() {
        let layout = makeLayout(
            positions: [
                "parent-a": CGPoint(x: -130, y: 0),
                "parent-b": CGPoint(x: 130, y: 0),
                "child-a": CGPoint(x: -260, y: 260),
                "child-b": CGPoint(x: 260, y: 260),
            ],
            parentPairs: [
                ("parent-a", "child-a"), ("parent-b", "child-a"),
                ("parent-a", "child-b"), ("parent-b", "child-b"),
            ]
        )
        let renderer = ImageRenderer(
            content: TreeExportView(layout: layout).frame(width: 1200, height: 1200)
        )

        #expect(renderer.uiImage?.size == CGSize(width: 1200, height: 1200))
        #expect(TreeConnectionPlan.make(from: layout).families.count == 1)
    }

    @Test func largeRasterExportUsesAvailableResolutionWithinSafeLimits() {
        let positions = Dictionary(uniqueKeysWithValues: (0..<40).map { index in
            ("person-\(index)", CGPoint(x: CGFloat(index) * 260, y: 0))
        })
        let layout = makeLayout(positions: positions, parentPairs: [])
        let raster = TreeRasterExportSize(layout: layout, showsRelationshipLabels: false)

        #expect(raster.size.width > 1_200)
        #expect(raster.size.width <= TreeRasterExportSize.maximumDimension)
        #expect(raster.size.height <= TreeRasterExportSize.maximumDimension)
        #expect(raster.size.width * raster.size.height <= TreeRasterExportSize.maximumPixelCount + 10_000)
    }

    @Test func svgExportPreservesVectorContentAndEmbeddedPhotos() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(origin: .zero, size: CGSize(width: 8, height: 8)))
        }
        let photo = try #require(image.jpegData(compressionQuality: 0.8))
        let parent = TreeNodeLayout(
            id: "parent",
            person: PersonSnapshot(
                id: "parent",
                name: "A&B <Parent>",
                gender: .female,
                profilePhotoData: photo
            ),
            role: "Mother",
            position: CGPoint(x: 0, y: 0)
        )
        let child = TreeNodeLayout(
            id: "child",
            person: PersonSnapshot(id: "child", name: "Child", gender: .unspecified),
            role: "Child",
            position: CGPoint(x: 0, y: 260)
        )
        let edge = TreeEdgeLayout(
            id: "parent-child",
            fromPersonID: parent.id,
            toPersonID: child.id,
            from: parent.position,
            to: child.position,
            kind: .parent
        )
        let data = TreeSVGExporter.data(
            layout: TreeLayoutResult(nodes: [parent, child], edges: [edge]),
            showsRelationshipLabels: true,
            exportedAt: Date(timeIntervalSince1970: 0),
            locale: Locale(identifier: "en")
        )
        let svg = try #require(String(data: data, encoding: .utf8))

        #expect(XMLParser(data: data).parse())
        #expect(svg.contains("<line"))
        #expect(svg.contains("A&amp;B &lt;Parent&gt;"))
        #expect(svg.contains("data:image/jpeg;base64,\(photo.base64EncodedString())"))
        #expect(svg.contains("clip-path=\"url(#photo-0)\""))
    }

    @Test func exportEdgeIncludesMarriageLabel() {
        let marriageYear = "2004"
        let edge = TreeEdgeLayout(
            id: "marriage",
            fromPersonID: "a",
            toPersonID: "b",
            from: CGPoint(x: -100, y: 0),
            to: CGPoint(x: 100, y: 0),
            kind: .partner,
            subtype: .spouse,
            marriageYear: marriageYear
        )

        #expect(edge.marriageLabel == AppLanguage.localized("Married \(marriageYear)"))
    }

    @Test func unionLabelDistinguishesSpousesFromPartnersWithoutDates() {
        let spouse = TreeEdgeLayout(
            id: "spouse",
            fromPersonID: "a",
            toPersonID: "b",
            from: .zero,
            to: CGPoint(x: 100, y: 0),
            kind: .partner,
            subtype: .spouse
        )
        let partner = TreeEdgeLayout(
            id: "partner",
            fromPersonID: "a",
            toPersonID: "c",
            from: .zero,
            to: CGPoint(x: -100, y: 0),
            kind: .partner,
            subtype: .partner,
            marriageYear: "2004"
        )

        #expect(spouse.marriageLabel == AppLanguage.localized("Married"))
        #expect(partner.marriageLabel == AppLanguage.localized("Partner"))
    }

    @Test func denseFamiliesKeepEveryRailOnADistinctTrack() {
        var positions = [String: CGPoint]()
        var pairs = [(String, String)]()
        for index in 0..<8 {
            let left = "left-\(index)"
            let right = "right-\(index)"
            let child = "child-\(index)"
            positions[left] = CGPoint(x: -600 + CGFloat(index) * 20, y: 0)
            positions[right] = CGPoint(x: 600 - CGFloat(index) * 20, y: 0)
            positions[child] = CGPoint(x: CGFloat(index) * 10, y: 260)
            pairs += [(left, child), (right, child)]
        }

        let plan = TreeConnectionPlan.make(from: makeLayout(
            positions: positions,
            parentPairs: pairs
        ))
        let railYValues: [CGFloat] = plan.families.flatMap(\.segments).compactMap { segment in
            guard segment.orientation == .horizontal,
                  abs(segment.end.x - segment.start.x) > 40 else { return nil }
            return segment.start.y
        }

        #expect(plan.families.count == 8)
        #expect(Set(railYValues).count == railYValues.count)
    }

    @Test func unavoidableCrossingsAreReportedAsBridgesNotJunctions() {
        let positions = [
            "outer-left": CGPoint(x: -200, y: 0),
            "outer-right": CGPoint(x: 200, y: 0),
            "inner-left": CGPoint(x: -100, y: 0),
            "inner-right": CGPoint(x: 100, y: 0),
            "child-a": CGPoint(x: 100, y: 260),
            "child-b": CGPoint(x: -100, y: 260),
        ]
        let plan = TreeConnectionPlan.make(from: makeLayout(
            positions: positions,
            parentPairs: [
                ("outer-left", "child-a"), ("outer-right", "child-a"),
                ("inner-left", "child-b"), ("inner-right", "child-b"),
            ]
        ))

        #expect(!plan.crossings.isEmpty)
        #expect(plan.crossings.allSatisfy { point in
            !plan.families.flatMap(\.junctions).contains(point)
        })
    }

    @Test func routePlanningIsDeterministicWhenEdgesAreReordered() {
        let positions = [
            "a": CGPoint(x: -100, y: 0),
            "b": CGPoint(x: 100, y: 0),
            "c": CGPoint(x: -100, y: 260),
            "d": CGPoint(x: 100, y: 260),
        ]
        let pairs = [("a", "c"), ("b", "c"), ("a", "d"), ("b", "d")]

        let forward = TreeConnectionPlan.make(from: makeLayout(
            positions: positions,
            parentPairs: pairs
        ))
        let reversed = TreeConnectionPlan.make(from: makeLayout(
            positions: positions,
            parentPairs: Array(pairs.reversed())
        ))

        #expect(forward == reversed)
    }

    @Test func separateFamiliesNeverShareACollinearVerticalChannel() {
        let positions = [
            "a": CGPoint(x: -100, y: 0),
            "b": CGPoint(x: 100, y: 0),
            "c": CGPoint(x: -112, y: 0),
            "d": CGPoint(x: 96, y: 0),
            "child-a": CGPoint(x: -20, y: 260),
            "child-b": CGPoint(x: 20, y: 260),
        ]
        let plan = TreeConnectionPlan.make(from: makeLayout(
            positions: positions,
            parentPairs: [
                ("a", "child-a"), ("b", "child-a"),
                ("c", "child-b"), ("d", "child-b"),
            ]
        ))

        for firstIndex in plan.families.indices {
            for secondIndex in plan.families.indices where secondIndex > firstIndex {
                let firstSegments = plan.families[firstIndex].segments.filter {
                    $0.orientation == .vertical
                }
                let secondSegments = plan.families[secondIndex].segments.filter {
                    $0.orientation == .vertical
                }
                #expect(!firstSegments.contains { first in
                    secondSegments.contains { second in
                        guard first.start.x == second.start.x else { return false }
                        let lower = max(
                            min(first.start.y, first.end.y),
                            min(second.start.y, second.end.y)
                        )
                        let upper = min(
                            max(first.start.y, first.end.y),
                            max(second.start.y, second.end.y)
                        )
                        return lower < upper
                    }
                })
            }
        }
    }

    private func makeLayout(
        positions: [String: CGPoint],
        parentPairs: [(String, String)]
    ) -> TreeLayoutResult {
        let nodes = positions.keys.sorted().map { id in
            TreeNodeLayout(
                id: id,
                person: PersonSnapshot(id: id, name: id, gender: .unspecified),
                role: "Family member",
                position: positions[id]!
            )
        }
        let edges = parentPairs.enumerated().map { index, pair in
            TreeEdgeLayout(
                id: "parent-\(index)",
                fromPersonID: pair.0,
                toPersonID: pair.1,
                from: positions[pair.0]!,
                to: positions[pair.1]!,
                kind: .parent
            )
        }
        return TreeLayoutResult(nodes: nodes, edges: edges)
    }
}
