-- Deferred #3 — cached BGE-M3 (or any OpenAI-compatible) embedding of the
-- exemplar content, for semantic "write in my voice about X" retrieval. Stored
-- as a JSON number[]; NULL until computed (and only ever computed when an
-- embeddings endpoint is configured). Additive, nullable, non-destructive.
ALTER TABLE "BrandExemplar" ADD COLUMN "embedding" JSONB;
