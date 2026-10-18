# Database migrations

These SQL files describe the historical MySQL schema and are not used by the active Firestore backend. Firestore collections are created by API writes; deploy required composite indexes with `firebase deploy --only firestore:indexes` using the repository-root `firebase.json`. Existing MySQL data is not migrated automatically. Back up any legacy database before planning a separate data import.
