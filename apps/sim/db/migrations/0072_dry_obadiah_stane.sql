CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

DROP INDEX "doc_filename_idx";--> statement-breakpoint
DROP INDEX "doc_kb_uploaded_at_idx";--> statement-breakpoint
CREATE INDEX "doc_filename_gin_idx" ON "document" USING gin (to_tsvector('english', "filename"));--> statement-breakpoint
CREATE INDEX "doc_filename_trgm_idx" ON "document" USING gin ("filename" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "doc_cursor_pagination_idx" ON "document" USING btree ("knowledge_base_id","uploaded_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "doc_cursor_search_idx" ON "document" USING btree ("knowledge_base_id","uploaded_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "document"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "emb_cursor_pagination_idx" ON "embedding" USING btree ("document_id","chunk_index","id");--> statement-breakpoint
CREATE INDEX "emb_cursor_enabled_idx" ON "embedding" USING btree ("document_id","enabled","chunk_index","id");--> statement-breakpoint
CREATE INDEX "emb_content_trgm_idx" ON "embedding" USING gin ("content" gin_trgm_ops);