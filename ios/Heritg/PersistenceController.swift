import CoreData
import Foundation

final class PersistenceController {
    static let shared = PersistenceController()

    // SwiftData used this URL in 1.0.0. Reusing it lets Core Data open the
    // compatible store in place instead of presenting an empty new library.
    static let productionStoreURL = NSPersistentContainer.defaultDirectoryURL()
        .appendingPathComponent("default.store")

    static let managedObjectModel: NSManagedObjectModel = {
        let model = NSManagedObjectModel()
        model.entities = [
            entity(
                named: "FamilyTree",
                className: NSStringFromClass(FamilyTree.self),
                attributes: [
                    attribute("id", .stringAttributeType, defaultValue: ""),
                    attribute("title", .stringAttributeType, defaultValue: ""),
                    attribute("createdAt", .dateAttributeType),
                    attribute("updatedAt", .dateAttributeType),
                    attribute("lastSelectedPersonID", .stringAttributeType, optional: true),
                ]
            ),
            entity(
                named: "Person",
                className: NSStringFromClass(Person.self),
                attributes: [
                    attribute("id", .stringAttributeType, defaultValue: ""),
                    attribute("treeID", .stringAttributeType, defaultValue: ""),
                    attribute("displayName", .stringAttributeType, defaultValue: ""),
                    attribute("genderRaw", .stringAttributeType, defaultValue: PersonGender.unspecified.rawValue),
                    attribute("createdAt", .dateAttributeType),
                    attribute("birthDate", .dateAttributeType, optional: true),
                    attribute("deathDate", .dateAttributeType, optional: true),
                    attribute("birthDatePrecisionRaw", .stringAttributeType, defaultValue: BirthDatePrecision.exact.rawValue),
                    attribute("notes", .stringAttributeType, defaultValue: ""),
                    attribute("addressLine", .stringAttributeType, defaultValue: ""),
                    attribute("city", .stringAttributeType, defaultValue: ""),
                    attribute("province", .stringAttributeType, defaultValue: ""),
                    attribute("country", .stringAttributeType, defaultValue: ""),
                    attribute("postalCode", .stringAttributeType, defaultValue: ""),
                    attribute("profilePhotoData", .binaryDataAttributeType, optional: true, externalStorage: true),
                ]
            ),
            entity(
                named: "FamilyRelationship",
                className: NSStringFromClass(FamilyRelationship.self),
                attributes: [
                    attribute("id", .stringAttributeType, defaultValue: ""),
                    attribute("treeID", .stringAttributeType, defaultValue: ""),
                    attribute("fromPersonID", .stringAttributeType, defaultValue: ""),
                    attribute("toPersonID", .stringAttributeType, defaultValue: ""),
                    attribute("kindRaw", .stringAttributeType, defaultValue: RelationshipKind.parent.rawValue),
                    attribute("subtypeRaw", .stringAttributeType, defaultValue: ""),
                    attribute("createdAt", .dateAttributeType),
                    attribute("marriageDate", .dateAttributeType, optional: true),
                ]
            ),
        ]
        return model
    }()

    let container: NSPersistentContainer

    init(
        inMemory: Bool = PersistenceController.shouldUseInMemoryStore,
        storeURL: URL? = nil
    ) {
        container = NSPersistentContainer(
            name: "Heritg",
            managedObjectModel: Self.managedObjectModel
        )

        let description = NSPersistentStoreDescription()
        description.type = inMemory ? NSInMemoryStoreType : NSSQLiteStoreType
        if !inMemory {
            description.url = storeURL ?? Self.productionStoreURL
        }
        description.shouldMigrateStoreAutomatically = true
        description.shouldInferMappingModelAutomatically = true
        description.setOption(true as NSNumber, forKey: NSPersistentHistoryTrackingKey)
        description.setOption(
            true as NSNumber,
            forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey
        )
        container.persistentStoreDescriptions = [description]

        container.loadPersistentStores { _, error in
            if let error {
                fatalError("Could not load Core Data store: \(error)")
            }
        }

        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
    }

    static func entity(named name: String) -> NSEntityDescription {
        guard let entity = managedObjectModel.entitiesByName[name] else {
            preconditionFailure("Missing Core Data entity \(name)")
        }
        return entity
    }

    private static var shouldUseInMemoryStore: Bool {
        let arguments = ProcessInfo.processInfo.arguments
        return arguments.contains("-ui_testing") ||
            arguments.contains("-ui-testing") ||
            ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1" ||
            NSClassFromString("XCTestCase") != nil
    }

    private static func entity(
        named name: String,
        className: String,
        attributes: [NSAttributeDescription]
    ) -> NSEntityDescription {
        let entity = NSEntityDescription()
        entity.name = name
        entity.managedObjectClassName = className
        entity.properties = attributes
        return entity
    }

    private static func attribute(
        _ name: String,
        _ type: NSAttributeType,
        optional: Bool = false,
        defaultValue: Any? = nil,
        externalStorage: Bool = false
    ) -> NSAttributeDescription {
        let attribute = NSAttributeDescription()
        attribute.name = name
        attribute.attributeType = type
        attribute.isOptional = optional
        attribute.defaultValue = defaultValue
        attribute.allowsExternalBinaryDataStorage = externalStorage
        return attribute
    }
}
