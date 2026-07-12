import { Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

// Shield shimmer for ShieldBuff (see buffs/ShieldBuff.ts). Reuses FogFilter.ts's
// hash/value-noise/fbm building blocks but swaps the purple fog palette for a
// tri-tone black/red/transparent blend — deliberately blended/misty, never a
// stark two-tone split. See card_defs/03_blood_mage/AGENTS.md for the design intent.
// uShimmerAlpha is capped low by the caller so the unit stays visible underneath.

const SHIELD_SHIMMER_FRAG_GLSL = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uShimmerAlpha;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i),                hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

float fbm(vec2 p) {
    return 0.500 * valueNoise(p)
         + 0.250 * valueNoise(p * 2.0 + vec2(5.2, 1.3))
         + 0.125 * valueNoise(p * 4.0 + vec2(2.4, 8.7));
}

void main() {
    float alpha = texture(uTexture, vTextureCoord).a;
    if (alpha < 0.01) { finalColor = vec4(0.0); return; }

    vec2  uv = vTextureCoord * 6.0;
    float t  = uTime * 0.35;
    float n  = fbm(uv + vec2(t, -t * 0.6));

    vec3 blackTone = vec3(0.03, 0.00, 0.03);
    vec3 redTone   = vec3(0.55, 0.05, 0.08);

    // Tri-tone blend: low noise fades toward transparent, mid noise sits black,
    // high noise shifts toward red. Never a hard two-tone split.
    float toBlack = smoothstep(0.15, 0.45, n);
    float toRed   = smoothstep(0.55, 0.88, n);
    vec3  color   = mix(blackTone, redTone, toRed);
    float band    = mix(0.0, 1.0, toBlack);

    float outAlpha = alpha * uShimmerAlpha * band;
    finalColor = vec4(color * outAlpha, outAlpha);
}
`;

const SHIELD_SHIMMER_WGSL = `
struct GlobalFilterUniforms {
    uInputSize   : vec4<f32>,
    uInputPixel  : vec4<f32>,
    uInputClamp  : vec4<f32>,
    uOutputFrame : vec4<f32>,
    uGlobalFrame : vec4<f32>,
    uOutputTexture: vec4<f32>,
};

struct ShimmerUniforms {
    uTime: f32,
    uShimmerAlpha: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> shimmerUniforms: ShimmerUniforms;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0)       uv      : vec2<f32>,
};

fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
    var pos = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    pos.x   = pos.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    pos.y   = pos.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    return vec4<f32>(pos, 0.0, 1.0);
}

fn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32> {
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
    return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}

fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn valueNoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i),                    hash(i + vec2<f32>(1.0, 0.0)), u.x),
        mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), u.x),
        u.y
    );
}

fn fbm(p: vec2<f32>) -> f32 {
    return 0.500 * valueNoise(p)
         + 0.250 * valueNoise(p * 2.0 + vec2<f32>(5.2, 1.3))
         + 0.125 * valueNoise(p * 4.0 + vec2<f32>(2.4, 8.7));
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>, @builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let alpha = textureSample(uTexture, uSampler, uv).a;
    if (alpha < 0.01) { return vec4<f32>(0.0); }

    let uv6 = uv * 6.0;
    let t   = shimmerUniforms.uTime * 0.35;
    let n   = fbm(uv6 + vec2<f32>(t, -t * 0.6));

    let blackTone = vec3<f32>(0.03, 0.00, 0.03);
    let redTone   = vec3<f32>(0.55, 0.05, 0.08);

    let toBlack = smoothstep(0.15, 0.45, n);
    let toRed   = smoothstep(0.55, 0.88, n);
    let color   = mix(blackTone, redTone, toRed);
    let band    = mix(0.0, 1.0, toBlack);

    let outAlpha = alpha * shimmerUniforms.uShimmerAlpha * band;
    return vec4<f32>(color * outAlpha, outAlpha);
}
`;

export class ShieldShimmerFilter extends Filter {
    constructor() {
        super({
            glProgram: GlProgram.from({
                vertex: defaultFilterVert,
                fragment: SHIELD_SHIMMER_FRAG_GLSL,
                name: 'shield-shimmer-filter',
            }),
            gpuProgram: GpuProgram.from({
                vertex:   { source: SHIELD_SHIMMER_WGSL, entryPoint: 'mainVertex'   },
                fragment: { source: SHIELD_SHIMMER_WGSL, entryPoint: 'mainFragment' },
            }),
            resources: {
                shimmerUniforms: new UniformGroup({
                    uTime:         { value: 0.0, type: 'f32' },
                    uShimmerAlpha: { value: 0.4, type: 'f32' },
                }),
            },
            // The shimmer shell is drawn as a stroke/fill right at the edge of the buff-visual
            // Graphics' local bounds; a little padding keeps it from getting clipped when the
            // filter's render target is sized off those bounds.
            padding: 6,
        });
    }

    /** Drives the noise animation. Callers pass an absolute clock (e.g. engine.gameTime) directly. */
    set time(value: number) {
        this.resources.shimmerUniforms.uniforms.uTime = value;
    }

    /** Overall shimmer opacity; callers should cap this low (~<=0.5) so the unit stays visible underneath. */
    set shimmerAlpha(value: number) {
        this.resources.shimmerUniforms.uniforms.uShimmerAlpha = value;
    }
}

/** Returns a ShieldShimmerFilter, or null if the GPU/driver can't compile it. */
export function tryCreateShieldShimmerFilter(): ShieldShimmerFilter | null {
    try {
        return new ShieldShimmerFilter();
    } catch (e) {
        console.warn('[ShieldShimmerFilter] Shader compilation failed — falling back to no shimmer overlay.', e);
        return null;
    }
}
