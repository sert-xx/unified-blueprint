import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelManager } from './model-manager.js';

describe('ModelManager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `ubp-test-model-manager-${Date.now()}`);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('uses default cache dir when not specified', () => {
      const manager = new ModelManager();
      const cacheDir = manager.getCacheDir();
      expect(cacheDir.replace(/\\/g, '/')).toContain('.cache/ubp/models');
    });

    it('uses custom cache dir', () => {
      const manager = new ModelManager({ cacheDir: testDir });
      expect(manager.getCacheDir()).toBe(testDir);
    });

    it('expands tilde in cache dir', () => {
      const manager = new ModelManager({ cacheDir: '~/custom-cache' });
      const cacheDir = manager.getCacheDir();
      expect(cacheDir).not.toContain('~');
      expect(cacheDir).toContain('custom-cache');
    });
  });

  describe('ensureCacheDir', () => {
    it('creates directory if it does not exist', () => {
      const manager = new ModelManager({ cacheDir: testDir });
      expect(existsSync(testDir)).toBe(false);
      manager.ensureCacheDir();
      expect(existsSync(testDir)).toBe(true);
    });

    it('does not throw if directory already exists', () => {
      mkdirSync(testDir, { recursive: true });
      const manager = new ModelManager({ cacheDir: testDir });
      expect(() => manager.ensureCacheDir()).not.toThrow();
    });
  });

  describe('isModelCached', () => {
    it('returns false when cache dir does not exist', () => {
      const manager = new ModelManager({
        cacheDir: '/nonexistent/path/12345',
      });
      expect(manager.isModelCached('Xenova/all-MiniLM-L6-v2')).toBe(false);
    });

    it('returns false when model is not cached', () => {
      mkdirSync(testDir, { recursive: true });
      const manager = new ModelManager({ cacheDir: testDir });
      expect(manager.isModelCached('Xenova/all-MiniLM-L6-v2')).toBe(false);
    });

    it('returns true when model directory exists', () => {
      mkdirSync(testDir, { recursive: true });
      mkdirSync(join(testDir, 'models--Xenova--all-MiniLM-L6-v2'));
      const manager = new ModelManager({ cacheDir: testDir });
      expect(manager.isModelCached('Xenova/all-MiniLM-L6-v2')).toBe(true);
    });
  });

  describe('estimateCacheSize', () => {
    it('returns 0 when cache dir does not exist', () => {
      const manager = new ModelManager({
        cacheDir: '/nonexistent/path/12345',
      });
      expect(manager.estimateCacheSize()).toBe(0);
    });

    it('returns 0 for empty cache dir', () => {
      mkdirSync(testDir, { recursive: true });
      const manager = new ModelManager({ cacheDir: testDir });
      expect(manager.estimateCacheSize()).toBe(0);
    });

    it('returns non-zero for non-empty cache dir', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'model-file'), 'data');
      const manager = new ModelManager({ cacheDir: testDir });
      expect(manager.estimateCacheSize()).not.toBe(0);
    });
  });
});
