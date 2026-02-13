/**
 * Card definition shape. Each card def file exports an object matching this.
 */
export interface CardDef {
    id: string;
    name: string;
    /** Optional description or effect text */
    description?: string;
    /** Optional image or art path */
    art?: string;
}
