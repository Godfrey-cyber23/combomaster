# Database migrations

Apply migrations in filename order using `npm --prefix backend run migrate` after configuring the migration database account in the repository-root `.env`. The runner records applied filenames in `schema_migrations`. Keep the runtime account read/write-only; the migration account needs DDL privileges. Do not edit production tables manually. Add a new numbered migration for every schema change and test it against a fresh database and a representative upgrade database.
