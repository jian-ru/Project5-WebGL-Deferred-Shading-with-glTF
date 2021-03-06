#version 100
// #extension GL_EXT_draw_buffers: enable
precision highp float;
precision highp int;

uniform sampler2D u_colmap;
uniform sampler2D u_normap;

// varying vec3 v_position;
varying vec3 v_normal;
varying vec2 v_uv;

float packRGBA(vec4 color)
{
	color = floor(color * 255.0 + 0.5);
	return color.r * 16777216.0 + color.g * 65536.0 + color.b * 256.0 + color.a;
}

vec3 applyNormalMap(vec3 geomnor, vec3 normap)
{
    normap = normap * 2.0 - 1.0;
    vec3 up = normalize(vec3(0.001, 1, 0.001));
    vec3 surftan = normalize(cross(geomnor, up));
    vec3 surfbinor = cross(geomnor, surftan);
    return normap.y * surftan + normap.x * surfbinor + normap.z * geomnor;
}

void main()
{
    // TODO: copy values into gl_FragData[0], [1], etc.
    // You can use the GLSL texture2D function to access the textures using
    // the UV in v_uv.
	vec4 albedo = texture2D(u_colmap, v_uv);
	vec3 mapnrm = texture2D(u_normap, v_uv).xyz;
	
	vec3 nrm = applyNormalMap(v_normal, mapnrm);
	
    // this gives you the idea
	// gl_FragData[0] = vec4(nrm.xy, packRGBA(albedo), 1.0);
	gl_FragColor = vec4(nrm.xy, packRGBA(albedo), 1.0);
}
