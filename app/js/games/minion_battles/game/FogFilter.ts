import { Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

// Animated dark-purple fog for full-darkness tiles.
// Reads the darkness overlay's alpha channel as the fog mask; replaces
// the flat black fill with procedural value-noise fog that slowly drifts.
// Fog fades in smoothly above uFogStartAlpha (corresponds to DarknessLevel.DARKNESS_FOG).

const FOG_FRAG_GLSL = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uFogStartAlpha;

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

    vec3 base = vec3(0.08, 0.00, 0.14); // deep purple

    // Fog fades in smoothly from DARKNESS_FOG threshold to full darkness.
    float fogIntensity = smoothstep(uFogStartAlpha, 1.0, alpha);
    if (fogIntensity < 0.01) {
        finalColor = vec4(base * alpha, alpha);
        return;
    }

    vec2  uv = vTextureCoord * 5.0;
    float t  = uTime * 0.05;
    float n  = fbm(uv + vec2(t, t * 0.71));

    vec3 wisp     = vec3(0.30, 0.22, 0.42); // lighter purple-gray wisps
    vec3 fogColor = mix(base, wisp, n * 0.70);
    vec3 color    = mix(base, fogColor, fogIntensity);

    finalColor = vec4(color * alpha, alpha);
}
`;

const FOG_WGSL = `
struct GlobalFilterUniforms {
    uInputSize   : vec4<f32>,
    uInputPixel  : vec4<f32>,
    uInputClamp  : vec4<f32>,
    uOutputFrame : vec4<f32>,
    uGlobalFrame : vec4<f32>,
    uOutputTexture: vec4<f32>,
};

struct FogUniforms {
    uTime: f32,
    uFogStartAlpha: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> fogUniforms: FogUniforms;

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

    let base = vec3<f32>(0.08, 0.00, 0.14);

    let fogIntensity = smoothstep(fogUniforms.uFogStartAlpha, 1.0, alpha);
    if (fogIntensity < 0.01) { return vec4<f32>(base * alpha, alpha); }

    let uv5   = uv * 5.0;
    let t     = fogUniforms.uTime * 0.05;
    let n     = fbm(uv5 + vec2<f32>(t, t * 0.71));

    let wisp     = vec3<f32>(0.30, 0.22, 0.42);
    let fogColor = mix(base, wisp, n * 0.70);
    let color    = mix(base, fogColor, fogIntensity);

    return vec4<f32>(color * alpha, alpha);
}
`;

export class FogFilter extends Filter {
    constructor() {
        super({
            glProgram: GlProgram.from({
                vertex: defaultFilterVert,
                fragment: FOG_FRAG_GLSL,
                name: 'fog-filter',
            }),
            gpuProgram: GpuProgram.from({
                vertex:   { source: FOG_WGSL, entryPoint: 'mainVertex'   },
                fragment: { source: FOG_WGSL, entryPoint: 'mainFragment' },
            }),
            resources: {
                fogUniforms: new UniformGroup({
                    uTime:         { value: 0.0, type: 'f32' },
                    uFogStartAlpha: { value: 0.5, type: 'f32' },
                }),
            },
        });
    }

    advanceTime(dtSeconds: number): void {
        this.resources.fogUniforms.uniforms.uTime += dtSeconds;
    }

    set fogStartAlpha(value: number) {
        this.resources.fogUniforms.uniforms.uFogStartAlpha = value;
    }
}

/** Returns a FogFilter, or null if the GPU/driver can't compile it. */
export function tryCreateFogFilter(): FogFilter | null {
    try {
        return new FogFilter();
    } catch (e) {
        console.warn('[FogFilter] Shader compilation failed — falling back to flat darkness overlay.', e);
        return null;
    }
}
