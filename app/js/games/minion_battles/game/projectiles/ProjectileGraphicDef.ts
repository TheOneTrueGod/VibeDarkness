/**
 * Sprite-based projectile graphic definitions.
 *
 * Two sourcing strategies:
 *   frameFiles – one image URL per frame; frame count inferred from array length.
 *   file + frameDirection – a single sprite sheet sliced at runtime.
 */

export type SpriteProjectileGraphicDef =
    | {
          type: 'sprite';
          fps?: number;
          scale?: number;
          /** One image URL per frame. */
          frameFiles: string[];
      }
    | {
          type: 'sprite';
          frames: number;
          fps?: number;
          scale?: number;
          /** Single sprite-sheet image URL. */
          file: string;
          /** 'row' – frames in one horizontal strip; 'column' – one vertical strip. */
          frameDirection: 'row' | 'column';
      }
    | {
          type: 'sprite';
          frames: number;
          fps?: number;
          scale?: number;
          file: string;
          frameDirection: 'grid';
          /** Columns in the grid. Rows = Math.ceil(frames / columns). */
          columns: number;
      };
