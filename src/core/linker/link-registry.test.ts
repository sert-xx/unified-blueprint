import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  updateDocumentLinks,
  type LinkStore,
  type LinkInsertInput,
} from './link-registry.js';
import { LinkResolver, type DocumentLookup } from './link-resolver.js';
import type { ParsedLink } from '../../shared/types.js';

describe('updateDocumentLinks', () => {
  let store: LinkStore;
  let resolver: LinkResolver;
  let insertedLinks: LinkInsertInput[];
  let deletedDocIds: string[];

  beforeEach(() => {
    insertedLinks = [];
    deletedDocIds = [];

    store = {
      deleteBySourceDoc: (docId: string) => {
        deletedDocIds.push(docId);
      },
      insertLink: (link: LinkInsertInput) => {
        insertedLinks.push(link);
      },
    };

    resolver = new LinkResolver();
    resolver.buildIndex(['docs/auth.md', 'docs/login.md']);
    const mockLookup: DocumentLookup = {
      getAllFilepaths: () => ['docs/auth.md', 'docs/login.md'],
      getDocIdByFilepath: (fp: string) => {
        if (fp === 'docs/auth.md') return 'doc-auth';
        if (fp === 'docs/login.md') return 'doc-login';
        return null;
      },
    };
    resolver.setDocumentLookup(mockLookup);
  });

  it('deletes existing links and inserts new ones', () => {
    const links: ParsedLink[] = [
      {
        target: 'auth',
        type: 'references',
        context: 'See [[auth]]',
        sectionOrder: 0,
      },
    ];

    const result = updateDocumentLinks(
      store,
      resolver,
      'doc-source',
      'docs/source.md',
      links,
      new Map([[0, 1]]),
    );

    expect(deletedDocIds).toEqual(['doc-source']);
    expect(insertedLinks).toHaveLength(1);
    expect(insertedLinks[0]!.source_doc_id).toBe('doc-source');
    expect(insertedLinks[0]!.target_doc_id).toBe('doc-auth');
    expect(insertedLinks[0]!.type).toBe('references');
    expect(insertedLinks[0]!.target_title).toBe('auth');
    expect(result.resolved).toBe(1);
    expect(result.dangling).toBe(0);
  });

  it('handles dangling links', () => {
    const links: ParsedLink[] = [
      {
        target: 'nonexistent',
        type: 'depends_on',
        context: 'See [[nonexistent|depends_on]]',
        sectionOrder: 0,
      },
    ];

    const result = updateDocumentLinks(
      store,
      resolver,
      'doc-source',
      'docs/source.md',
      links,
      new Map(),
    );

    expect(insertedLinks).toHaveLength(1);
    expect(insertedLinks[0]!.target_doc_id).toBeNull();
    expect(result.resolved).toBe(0);
    expect(result.dangling).toBe(1);
  });

  it('maps sectionOrder to section DB ID', () => {
    const links: ParsedLink[] = [
      {
        target: 'auth',
        type: 'references',
        context: '',
        sectionOrder: 2,
      },
    ];

    updateDocumentLinks(
      store,
      resolver,
      'doc-source',
      'docs/source.md',
      links,
      new Map([[2, 42]]),
    );

    expect(insertedLinks[0]!.source_section_id).toBe(42);
  });

  it('handles multiple links with mixed resolution', () => {
    const links: ParsedLink[] = [
      {
        target: 'auth',
        type: 'references',
        context: '',
        sectionOrder: 0,
      },
      {
        target: 'nonexistent',
        type: 'depends_on',
        context: '',
        sectionOrder: 0,
      },
      {
        target: 'login',
        type: 'implements',
        context: '',
        sectionOrder: 1,
      },
    ];

    const result = updateDocumentLinks(
      store,
      resolver,
      'doc-source',
      'docs/source.md',
      links,
      new Map([
        [0, 1],
        [1, 2],
      ]),
    );

    expect(insertedLinks).toHaveLength(3);
    expect(result.resolved).toBe(2);
    expect(result.dangling).toBe(1);
  });

  it('handles empty links array', () => {
    const result = updateDocumentLinks(
      store,
      resolver,
      'doc-source',
      'docs/source.md',
      [],
      new Map(),
    );

    expect(deletedDocIds).toEqual(['doc-source']);
    expect(insertedLinks).toHaveLength(0);
    expect(result.resolved).toBe(0);
    expect(result.dangling).toBe(0);
  });
});
