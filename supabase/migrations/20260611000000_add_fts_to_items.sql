-- Add generated tsvector column for full-text search
ALTER TABLE public.items
ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', name)) STORED;

-- Create GIN index for fast text search
CREATE INDEX idx_items_fts ON public.items USING GIN (fts);
