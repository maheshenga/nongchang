DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'batches'
      AND column_name = 'field_revision_id'
  ) THEN
    ALTER TABLE "batches" ALTER COLUMN "field_revision_id" DROP NOT NULL;
  END IF;
END $$;
