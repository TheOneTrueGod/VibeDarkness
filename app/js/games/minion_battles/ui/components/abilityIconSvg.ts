/**
 * SVGs with width/height but no viewBox don't scale via CSS — inject the missing attribute
 * so every ability icon can be sized to the same box.
 */
export function ensureSvgViewBox(svg: string): string {
    if (svg.includes('viewBox')) return svg;
    const w = svg.match(/width="(\d+(?:\.\d+)?)"/)?.[1];
    const h = svg.match(/height="(\d+(?:\.\d+)?)"/)?.[1];
    if (!w || !h) return svg;
    return svg.replace('<svg ', `<svg viewBox="0 0 ${w} ${h}" `);
}
