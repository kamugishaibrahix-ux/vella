-- ============================================================================
-- Migration Validation Script
-- ============================================================================

SELECT version, name, hash, executed_at, LENGTH(statements) as statements_length
FROM supabase_migrations.migrations
ORDER BY version;

SELECT COUNT(*) as total_migrations FROM supabase_migrations.migrations;

-- Expected hashes:
-- 20241117: 2464f76dcbabba10b975aa149b86fa574174f6f4ed1600517b3d264b0ff199ac
-- 20250101: b333f20dcdf9544e21bf4179ae6975b722ec18b381506549cdec54b0831daf89
-- 20250101000000: fe8289446c678cb298ff3c027a48e3636794c0d2b2c890c34adc58436ffe324a
-- 20250217: 0fef2693aea12f8dbefd26b37499fa40ec554e570cd1a6f6d1fed3d1b99ec443
-- 20250218: 6881f1ef7c487562856c8b25c9af4998f56cdab52be9fbf88173bc740fb5688a
-- 20250219: baa7096617d09e78ccc8153fcdab7a0fec8b816c2e85a0d0611fdf5f3c5e5e90
-- 20250220: 2fe007676578e19a3048702429d79f0ca3d23f4e6811f644dd5e4d257dc5db29
-- 20250221: 575421ec17cc6d3d72abd59ec942749fc4cacf327964e2c2a1cc9207a93fc5ba
-- 20250222: 8474f928a233b73bbb8a45a5379f802cd307c179355aabbf0c61b1da8546e7a6
-- 20250223: 8233e5ec1a9371d400bfaf961861402b8827e23a3349c66e4498014abf16c5bf
-- 20251129154622: 7e5088c5f4b82c8023cb788c5fc42fc4a0bbde576581c0410b868f5a3b84c318
-- 20251219: 6aebb3cff8deec3b81be5f8ff74150ad7783fd0dbb1826bf502cb10b9a529265
-- 20251220: 062ee309a94cf726808a3605d34513f7b3f32e93a1a54b69ce21802409d2f8e5
