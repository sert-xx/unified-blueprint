import type Database from 'better-sqlite3';
import type {
  UUID,
  DataDocType,
  DataLinkType,
  GraphNode,
  GraphEdge,
} from '../types.js';

export interface GraphQueryService {
  traverseForward(
    centerDocId: UUID,
    maxDepth: number,
    linkTypes?: DataLinkType[],
  ): GraphNode[];
  traverseBackward(
    centerDocId: UUID,
    maxDepth: number,
    linkTypes?: DataLinkType[],
  ): GraphNode[];
  traverseBidirectional(
    centerDocId: UUID,
    maxDepth: number,
    linkTypes?: DataLinkType[],
  ): GraphNode[];
  getGraphStructure(
    centerDocId: UUID | null,
    maxDepth: number,
    linkTypes?: DataLinkType[],
  ): {
    nodes: Array<{
      id: UUID;
      title: string;
      docType: DataDocType;
      depth: number;
      outgoingLinkCount: number;
      incomingLinkCount: number;
    }>;
    edges: GraphEdge[];
  };
}

interface RawGraphRow {
  doc_id: string;
  title: string;
  doc_type: DataDocType;
  link_type: DataLinkType;
  min_depth: number;
}

export function createGraphQueryService(
  db: Database.Database,
): GraphQueryService {
  function buildLinkTypeFilter(linkTypes?: DataLinkType[]): string {
    if (!linkTypes || linkTypes.length === 0) return '';
    const placeholders = linkTypes.map(() => '?').join(',');
    return `AND l.type IN (${placeholders})`;
  }

  return {
    traverseForward(
      centerDocId: UUID,
      maxDepth: number,
      linkTypes?: DataLinkType[],
    ): GraphNode[] {
      const typeFilter = buildLinkTypeFilter(linkTypes);
      const sql = `
        WITH RECURSIVE forward_graph AS (
          SELECT
            l.target_doc_id AS doc_id,
            l.type,
            1 AS depth
          FROM links l
          WHERE l.source_doc_id = ?
            AND l.target_doc_id IS NOT NULL
            ${typeFilter}

          UNION ALL

          SELECT
            l.target_doc_id,
            l.type,
            fg.depth + 1
          FROM links l
          JOIN forward_graph fg ON l.source_doc_id = fg.doc_id
          WHERE fg.depth < ?
            AND l.target_doc_id IS NOT NULL
            ${typeFilter}
        )
        SELECT DISTINCT
          fg.doc_id,
          d.title,
          d.doc_type,
          fg.type AS link_type,
          MIN(fg.depth) AS min_depth
        FROM forward_graph fg
        JOIN documents d ON fg.doc_id = d.id
        WHERE fg.doc_id != ?
        GROUP BY fg.doc_id
        ORDER BY min_depth ASC, d.title ASC
      `;

      const params: (string | number)[] = [centerDocId];
      if (linkTypes && linkTypes.length > 0) params.push(...linkTypes);
      params.push(maxDepth);
      if (linkTypes && linkTypes.length > 0) params.push(...linkTypes);
      params.push(centerDocId);

      const rows = db.prepare(sql).all(...params) as RawGraphRow[];

      return rows.map((row) => ({
        docId: row.doc_id,
        title: row.title,
        docType: row.doc_type,
        depth: row.min_depth,
        linkType: row.link_type,
        direction: 'outgoing' as const,
      }));
    },

    traverseBackward(
      centerDocId: UUID,
      maxDepth: number,
      linkTypes?: DataLinkType[],
    ): GraphNode[] {
      const typeFilter = buildLinkTypeFilter(linkTypes);
      const sql = `
        WITH RECURSIVE backward_graph AS (
          SELECT
            l.source_doc_id AS doc_id,
            l.type,
            1 AS depth
          FROM links l
          WHERE l.target_doc_id = ?
            ${typeFilter}

          UNION ALL

          SELECT
            l.source_doc_id,
            l.type,
            bg.depth + 1
          FROM links l
          JOIN backward_graph bg ON l.target_doc_id = bg.doc_id
          WHERE bg.depth < ?
            ${typeFilter}
        )
        SELECT DISTINCT
          bg.doc_id,
          d.title,
          d.doc_type,
          bg.type AS link_type,
          MIN(bg.depth) AS min_depth
        FROM backward_graph bg
        JOIN documents d ON bg.doc_id = d.id
        WHERE bg.doc_id != ?
        GROUP BY bg.doc_id
        ORDER BY min_depth ASC, d.title ASC
      `;

      const params: (string | number)[] = [centerDocId];
      if (linkTypes && linkTypes.length > 0) params.push(...linkTypes);
      params.push(maxDepth);
      if (linkTypes && linkTypes.length > 0) params.push(...linkTypes);
      params.push(centerDocId);

      const rows = db.prepare(sql).all(...params) as RawGraphRow[];

      return rows.map((row) => ({
        docId: row.doc_id,
        title: row.title,
        docType: row.doc_type,
        depth: row.min_depth,
        linkType: row.link_type,
        direction: 'incoming' as const,
      }));
    },

    traverseBidirectional(
      centerDocId: UUID,
      maxDepth: number,
      linkTypes?: DataLinkType[],
    ): GraphNode[] {
      const forward = this.traverseForward(centerDocId, maxDepth, linkTypes);
      const backward = this.traverseBackward(centerDocId, maxDepth, linkTypes);

      // Merge: prefer the entry with the smaller depth
      const nodeMap = new Map<string, GraphNode>();
      for (const node of [...forward, ...backward]) {
        const existing = nodeMap.get(node.docId);
        if (!existing || node.depth < existing.depth) {
          nodeMap.set(node.docId, node);
        }
      }

      return Array.from(nodeMap.values()).sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.title.localeCompare(b.title);
      });
    },

    getGraphStructure(
      centerDocId: UUID | null,
      maxDepth: number,
      linkTypes?: DataLinkType[],
    ): {
      nodes: Array<{
        id: UUID;
        title: string;
        docType: DataDocType;
        depth: number;
        outgoingLinkCount: number;
        incomingLinkCount: number;
      }>;
      edges: GraphEdge[];
    } {
      // If no center, return full graph
      if (centerDocId === null) {
        const allDocs = db
          .prepare('SELECT id, title, doc_type FROM documents')
          .all() as Array<{
          id: string;
          title: string;
          doc_type: DataDocType;
        }>;

        const allLinks = db
          .prepare(
            'SELECT source_doc_id, target_doc_id, type FROM links WHERE target_doc_id IS NOT NULL',
          )
          .all() as Array<{
          source_doc_id: string;
          target_doc_id: string;
          type: DataLinkType;
        }>;

        // Count links per doc
        const outCounts = new Map<string, number>();
        const inCounts = new Map<string, number>();
        for (const link of allLinks) {
          outCounts.set(
            link.source_doc_id,
            (outCounts.get(link.source_doc_id) ?? 0) + 1,
          );
          inCounts.set(
            link.target_doc_id,
            (inCounts.get(link.target_doc_id) ?? 0) + 1,
          );
        }

        return {
          nodes: allDocs.map((doc) => ({
            id: doc.id,
            title: doc.title,
            docType: doc.doc_type,
            depth: 0,
            outgoingLinkCount: outCounts.get(doc.id) ?? 0,
            incomingLinkCount: inCounts.get(doc.id) ?? 0,
          })),
          edges: allLinks.map((link) => ({
            source: link.source_doc_id,
            target: link.target_doc_id,
            type: link.type,
          })),
        };
      }

      // With center: get traversal nodes + edges
      const nodes = this.traverseBidirectional(
        centerDocId,
        maxDepth,
        linkTypes,
      );
      const nodeIds = new Set([centerDocId, ...nodes.map((n) => n.docId)]);

      // Get the center doc info
      const centerDoc = db
        .prepare('SELECT id, title, doc_type FROM documents WHERE id = ?')
        .get(centerDocId) as {
        id: string;
        title: string;
        doc_type: DataDocType;
      } | undefined;

      // Collect edges between known nodes
      const allLinks = db
        .prepare(
          'SELECT source_doc_id, target_doc_id, type FROM links WHERE target_doc_id IS NOT NULL',
        )
        .all() as Array<{
        source_doc_id: string;
        target_doc_id: string;
        type: DataLinkType;
      }>;

      const edges: GraphEdge[] = allLinks.filter(
        (link) =>
          nodeIds.has(link.source_doc_id) && nodeIds.has(link.target_doc_id),
      ).map((link) => ({
        source: link.source_doc_id,
        target: link.target_doc_id,
        type: link.type,
      }));

      // Count links
      const outCounts = new Map<string, number>();
      const inCounts = new Map<string, number>();
      for (const edge of edges) {
        outCounts.set(edge.source, (outCounts.get(edge.source) ?? 0) + 1);
        inCounts.set(edge.target, (inCounts.get(edge.target) ?? 0) + 1);
      }

      const resultNodes = nodes.map((n) => ({
        id: n.docId,
        title: n.title,
        docType: n.docType,
        depth: n.depth,
        outgoingLinkCount: outCounts.get(n.docId) ?? 0,
        incomingLinkCount: inCounts.get(n.docId) ?? 0,
      }));

      if (centerDoc) {
        resultNodes.unshift({
          id: centerDoc.id,
          title: centerDoc.title,
          docType: centerDoc.doc_type,
          depth: 0,
          outgoingLinkCount: outCounts.get(centerDoc.id) ?? 0,
          incomingLinkCount: inCounts.get(centerDoc.id) ?? 0,
        });
      }

      return { nodes: resultNodes, edges };
    },
  };
}
