#!/usr/bin/env node

/**
 * Supabase Migration Audit and Cleanup Script
 * 
 * Scans all migration directories, detects duplicates, missing files,
 * and automatically fixes issues while preserving all unique migrations.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Directories to scan
const MIGRATION_DIRS = [
  'supabase/migrations',
  'apps/vella-control/supabase/migrations',
  'MOBILE/supabase/migrations',
];

const TARGET_DIR = 'supabase/migrations';

// Track all migrations found
const migrations = new Map(); // key: filename, value: { path, hash, timestamp, content }
const timestampGroups = new Map(); // key: timestamp, value: [filenames]

// Track actions taken
const actions = {
  renamed: [],
  deleted: [],
  copied: [],
  errors: [],
};

/**
 * Extract timestamp from filename (e.g., "20250220_progress.sql" -> "20250220")
 */
function extractTimestamp(filename) {
  const match = filename.match(/^(\d{8}(?:T\d{6})?)/);
  return match ? match[1] : null;
}

/**
 * Calculate SHA256 hash of file content
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Read all migration files from a directory
 */
function scanDirectory(dirPath) {
  const results = [];
  
  if (!fs.existsSync(dirPath)) {
    return results;
  }
  
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    if (!file.endsWith('.sql')) {
      continue;
    }
    
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (!stats.isFile()) {
      continue;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const hash = hashContent(content);
      const timestamp = extractTimestamp(file);
      
      results.push({
        filename: file,
        path: filePath,
        content,
        hash,
        timestamp,
        size: stats.size,
      });
    } catch (error) {
      actions.errors.push(`Failed to read ${filePath}: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * Scan all directories and collect migrations
 */
function scanAllDirectories() {
  console.log('🔍 SCANNING MIGRATION DIRECTORIES...\n');
  
  for (const dir of MIGRATION_DIRS) {
    const dirMigrations = scanDirectory(dir);
    console.log(`  ${dir}: ${dirMigrations.length} migration(s) found`);
    
    for (const migration of dirMigrations) {
      const key = migration.filename;
      
      if (migrations.has(key)) {
        // Duplicate filename found
        const existing = migrations.get(key);
        if (existing.hash !== migration.hash) {
          actions.errors.push(
            `CONFLICT: Same filename "${key}" with different content:\n` +
            `  ${existing.path}\n` +
            `  ${migration.path}`
          );
        }
      } else {
        migrations.set(key, migration);
        
        // Group by timestamp
        if (migration.timestamp) {
          if (!timestampGroups.has(migration.timestamp)) {
            timestampGroups.set(migration.timestamp, []);
          }
          timestampGroups.get(migration.timestamp).push(key);
        }
      }
    }
  }
  
  return migrations;
}

/**
 * Generate scan report
 */
function generateScanReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 SCAN REPORT');
  console.log('='.repeat(80) + '\n');
  
  const allMigrations = Array.from(migrations.values());
  const targetMigrations = allMigrations.filter(m => m.path.startsWith(TARGET_DIR));
  const otherMigrations = allMigrations.filter(m => !m.path.startsWith(TARGET_DIR));
  
  console.log(`Total migrations found: ${allMigrations.length}`);
  console.log(`  In ${TARGET_DIR}: ${targetMigrations.length}`);
  console.log(`  In other directories: ${otherMigrations.length}`);
  console.log(`Unique timestamps: ${timestampGroups.size}`);
  
  // Find duplicates by timestamp
  const duplicateTimestamps = Array.from(timestampGroups.entries())
    .filter(([_, files]) => files.length > 1)
    .map(([timestamp, files]) => ({ timestamp, files }));
  
  if (duplicateTimestamps.length > 0) {
    console.log(`\n⚠️  DUPLICATE TIMESTAMPS FOUND: ${duplicateTimestamps.length}`);
    
    for (const { timestamp, files } of duplicateTimestamps) {
      console.log(`\n  Timestamp: ${timestamp} (${files.length} files)`);
      
      const fileData = files.map(f => migrations.get(f));
      const hashGroups = new Map();
      
      for (const file of fileData) {
        if (!hashGroups.has(file.hash)) {
          hashGroups.set(file.hash, []);
        }
        hashGroups.get(file.hash).push(file);
      }
      
      for (const [hash, group] of hashGroups.entries()) {
        if (group.length > 1) {
          console.log(`    ✅ IDENTICAL CONTENT (${group.length} files, hash: ${hash.substring(0, 8)}...)`);
          for (const f of group) {
            console.log(`       - ${f.path}`);
          }
        } else {
          console.log(`    ⚠️  UNIQUE CONTENT (hash: ${hash.substring(0, 8)}...)`);
          console.log(`       - ${group[0].path}`);
        }
      }
    }
  } else {
    console.log('\n✅ No duplicate timestamps found');
  }
  
  // Find missing files (in other dirs but not in target)
  const missingFiles = [];
  for (const migration of otherMigrations) {
    const targetPath = path.join(TARGET_DIR, migration.filename);
    if (!fs.existsSync(targetPath)) {
      missingFiles.push(migration);
    } else {
      // Check if content is identical
      const targetContent = fs.readFileSync(targetPath, 'utf8');
      const targetHash = hashContent(targetContent);
      if (targetHash !== migration.hash) {
        actions.errors.push(
          `CONFLICT: File "${migration.filename}" exists in both locations with different content`
        );
      }
    }
  }
  
  if (missingFiles.length > 0) {
    console.log(`\n📋 MISSING FILES (in other dirs, not in ${TARGET_DIR}): ${missingFiles.length}`);
    for (const file of missingFiles) {
      console.log(`  - ${file.path}`);
    }
  } else {
    console.log(`\n✅ All migrations present in ${TARGET_DIR}`);
  }
  
  // Find files in target that don't exist elsewhere (orphaned)
  const orphanedFiles = [];
  for (const migration of targetMigrations) {
    const existsElsewhere = otherMigrations.some(m => m.filename === migration.filename);
    if (!existsElsewhere) {
      orphanedFiles.push(migration);
    }
  }
  
  if (orphanedFiles.length > 0) {
    console.log(`\n📁 ORPHANED FILES (only in ${TARGET_DIR}): ${orphanedFiles.length}`);
    for (const file of orphanedFiles) {
      console.log(`  - ${file.filename}`);
    }
  }
  
  return { duplicateTimestamps, missingFiles, orphanedFiles };
}

/**
 * Apply fixes automatically
 */
function applyFixes(duplicateTimestamps, missingFiles) {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 APPLYING FIXES');
  console.log('='.repeat(80) + '\n');
  
  // Ensure target directory exists
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    console.log(`✅ Created directory: ${TARGET_DIR}`);
  }
  
  // Fix duplicate timestamps
  for (const { timestamp, files } of duplicateTimestamps) {
    const fileData = files.map(f => migrations.get(f));
    const hashGroups = new Map();
    
    // Group by hash
    for (const file of fileData) {
      if (!hashGroups.has(file.hash)) {
        hashGroups.set(file.hash, []);
      }
      hashGroups.get(file.hash).push(file);
    }
    
    // Find the "primary" file (first one in target dir, or first one alphabetically)
    const targetFiles = fileData.filter(f => f.path.startsWith(TARGET_DIR));
    const primaryFile = targetFiles.length > 0 
      ? targetFiles[0]
      : fileData.sort((a, b) => a.filename.localeCompare(b.filename))[0];
    
    let dedupeCounter = 2;
    
    for (const [hash, group] of hashGroups.entries()) {
      if (group.length > 1) {
        // Identical content - keep one, delete others
        const toKeep = group.find(f => f.path.startsWith(TARGET_DIR)) || group[0];
        const toDelete = group.filter(f => f !== toKeep);
        
        for (const file of toDelete) {
          if (file.path !== toKeep.path) {
            fs.unlinkSync(file.path);
            actions.deleted.push(file.path);
            console.log(`  🗑️  Deleted duplicate: ${file.path} (identical to ${toKeep.filename})`);
          }
        }
      } else {
        // Unique content - rename if not primary
        const file = group[0];
        if (file !== primaryFile && file.path.startsWith(TARGET_DIR)) {
          // Already in target, but needs renaming
          const newName = `${timestamp}_${dedupeCounter}.sql`;
          const newPath = path.join(TARGET_DIR, newName);
          
          fs.renameSync(file.path, newPath);
          actions.renamed.push({ from: file.filename, to: newName, path: newPath });
          console.log(`  📝 Renamed: ${file.filename} → ${newName}`);
          
          // Update migration record
          file.filename = newName;
          file.path = newPath;
          migrations.set(newName, file);
          migrations.delete(file.filename);
          
          dedupeCounter++;
        } else if (file !== primaryFile) {
          // Not in target, copy with dedupe name
          const newName = `${timestamp}_${dedupeCounter}.sql`;
          const newPath = path.join(TARGET_DIR, newName);
          
          fs.copyFileSync(file.path, newPath);
          actions.copied.push({ from: file.path, to: newPath });
          console.log(`  📋 Copied with rename: ${file.path} → ${newPath}`);
          
          dedupeCounter++;
        }
      }
    }
  }
  
  // Copy missing files
  for (const file of missingFiles) {
    const targetPath = path.join(TARGET_DIR, file.filename);
    
    // Check if target already exists with same content
    if (fs.existsSync(targetPath)) {
      const targetContent = fs.readFileSync(targetPath, 'utf8');
      const targetHash = hashContent(targetContent);
      
      if (targetHash === file.hash) {
        // Identical - delete source
        fs.unlinkSync(file.path);
        actions.deleted.push(file.path);
        console.log(`  🗑️  Deleted duplicate: ${file.path} (identical to ${targetPath})`);
      } else {
        // Different content - this should have been caught earlier
        actions.errors.push(`Cannot copy ${file.path} - target exists with different content`);
      }
    } else {
      // Copy to target
      fs.copyFileSync(file.path, targetPath);
      actions.copied.push({ from: file.path, to: targetPath });
      console.log(`  📋 Copied: ${file.path} → ${targetPath}`);
      
      // Delete source if not in target dir
      if (!file.path.startsWith(TARGET_DIR)) {
        fs.unlinkSync(file.path);
        actions.deleted.push(file.path);
        console.log(`  🗑️  Deleted source: ${file.path}`);
      }
    }
  }
  
  // Clean up other directories (delete files that are now in target)
  for (const dir of MIGRATION_DIRS) {
    if (dir === TARGET_DIR) continue;
    
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;
      
      const filePath = path.join(dir, file);
      const targetPath = path.join(TARGET_DIR, file);
      
      if (fs.existsSync(targetPath)) {
        // Check if identical
        const sourceContent = fs.readFileSync(filePath, 'utf8');
        const targetContent = fs.readFileSync(targetPath, 'utf8');
        
        if (hashContent(sourceContent) === hashContent(targetContent)) {
          fs.unlinkSync(filePath);
          actions.deleted.push(filePath);
          console.log(`  🗑️  Deleted duplicate: ${filePath} (identical to ${targetPath})`);
        }
      }
    }
  }
}

/**
 * Generate final report
 */
function generateFinalReport() {
  console.log('\n' + '='.repeat(80));
  console.log('✅ FINAL ROUTINE');
  console.log('='.repeat(80) + '\n');
  
  // Rescan target directory
  const finalMigrations = scanDirectory(TARGET_DIR);
  finalMigrations.sort((a, b) => a.filename.localeCompare(b.filename));
  
  console.log(`Final migration count in ${TARGET_DIR}: ${finalMigrations.length}\n`);
  console.log('Migration files (sorted by filename):');
  console.log('-'.repeat(80));
  
  for (const migration of finalMigrations) {
    const timestamp = extractTimestamp(migration.filename);
    const sizeKB = (migration.size / 1024).toFixed(2);
    console.log(`  ${migration.filename.padEnd(60)} ${timestamp || 'NO-TS'.padEnd(15)} ${sizeKB}KB`);
  }
  
  // Verify no duplicate timestamps (except intentional _N suffixes)
  const timestampMap = new Map();
  for (const migration of finalMigrations) {
    const timestamp = extractTimestamp(migration.filename);
    if (timestamp) {
      // Extract base timestamp (without _N suffix)
      const baseTimestamp = migration.filename.match(/^(\d{8}(?:T\d{6})?)/)?.[1];
      if (baseTimestamp) {
        if (!timestampMap.has(baseTimestamp)) {
          timestampMap.set(baseTimestamp, []);
        }
        timestampMap.get(baseTimestamp).push(migration.filename);
      }
    }
  }
  
  const conflicts = Array.from(timestampMap.entries())
    .filter(([_, files]) => files.length > 1)
    .filter(([_, files]) => {
      // Only report if there are files without _N suffix
      return files.some(f => !f.match(/_\d+\.sql$/));
    });
  
  if (conflicts.length > 0) {
    console.log('\n⚠️  WARNING: Potential timestamp conflicts (check manually):');
    for (const [timestamp, files] of conflicts) {
      console.log(`  ${timestamp}: ${files.join(', ')}`);
    }
  } else {
    console.log('\n✅ No timestamp conflicts detected');
  }
  
  // Summary of actions
  console.log('\n' + '='.repeat(80));
  console.log('📋 SUMMARY OF ACTIONS');
  console.log('='.repeat(80));
  console.log(`  Files renamed: ${actions.renamed.length}`);
  console.log(`  Files deleted: ${actions.deleted.length}`);
  console.log(`  Files copied: ${actions.copied.length}`);
  console.log(`  Errors: ${actions.errors.length}`);
  
  if (actions.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    for (const error of actions.errors) {
      console.log(`  ${error}`);
    }
  }
  
  console.log('\n✅ Migration directory is ready for `supabase migration up --remote`');
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 SUPABASE MIGRATION AUDIT & CLEANUP\n');
  console.log('='.repeat(80) + '\n');
  
  // Scan all directories
  const allMigrations = scanAllDirectories();
  
  // Generate report
  const report = generateScanReport();
  
  // Apply fixes
  applyFixes(report.duplicateTimestamps, report.missingFiles);
  
  // Generate final report
  generateFinalReport();
  
  // Exit with error code if there were errors
  if (actions.errors.length > 0) {
    process.exit(1);
  }
}

// Run the script
main();

