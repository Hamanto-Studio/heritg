# HERITG Android

Native Android implementation of HERITG. The project uses a single Compose activity,
Room for family data, DataStore for preferences, and a platform-neutral Kotlin
archive codec.

Build with Java 17:

```sh
./gradlew test assembleDebug
```

The Android application is intentionally offline. Its manifest does not request
network, analytics, advertising, or broad storage capabilities.
