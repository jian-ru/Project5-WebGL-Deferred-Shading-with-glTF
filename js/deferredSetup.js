(function() {
    'use strict';

    window.R = {};
    R.pass_copy = {};
	R.pass_copyDepth = {};
    R.pass_debug = {};
    R.pass_deferred = {};
	R.pass_bloom = {}; // bloom
	R.pass_motionblur = {};
	R.pass_scissorTestDebug = {};
	R.pass_sphereProxyDebug = {};
    R.lights = [];

    R.NUM_GBUFFERS = 1;

    /**
     * Set up the deferred pipeline framebuffer objects and textures.
     */
    R.deferredSetup = function() {
        setupLights();
        loadAllShaderPrograms();
        R.pass_copy.setup();
		R.pass_copyDepth.setup();
        R.pass_deferred.setup();
		R.pass_bloom.setup();
    };

    // TODO: Edit if you want to change the light initial positions
    R.light_min = [-14, 0, -6];
    R.light_max = [14, 18, 6];
    R.light_dt = -0.03;
    R.LIGHT_RADIUS = 4.0;
    R.NUM_LIGHTS = 100; // TODO: test with MORE lights!
    var setupLights = function() {
        Math.seedrandom(0);

        var posfn = function() {
            var r = [0, 0, 0];
            for (var i = 0; i < 3; i++) {
                var mn = R.light_min[i];
                var mx = R.light_max[i];
                r[i] = Math.random() * (mx - mn) + mn;
            }
            return r;
        };

        for (var i = 0; i < R.NUM_LIGHTS; i++) {
            R.lights.push({
                pos: posfn(),
                col: [
                    0 + Math.random(),
                    0 + Math.random(),
                    0 + Math.random()],
                rad: R.LIGHT_RADIUS
            });
        }
    };

    /**
     * Create/configure framebuffer between "copy" and "deferred" stages
     */
    R.pass_copy.setup = function() {
        // * Create the FBO
        R.pass_copy.fbo = gl.createFramebuffer();
        // * Create, bind, and store a depth target texture for the FBO
        R.pass_copy.depthTex = createAndBindDepthTargetTexture(R.pass_copy.fbo);

        // * Create, bind, and store "color" target textures for the FBO
        R.pass_copy.gbufs = [];
        var attachments = [];
		var formats = [gl.RGBA, gl.RGBA];
		var types = [gl.FLOAT, gl.FLOAT];
		
        for (var i = 0; i < R.NUM_GBUFFERS; i++) {
            var attachment = gl_draw_buffers['COLOR_ATTACHMENT' + i + '_WEBGL'];
            var tex = createAndBindColorTargetTexture(R.pass_copy.fbo, attachment, formats[i], types[i]);
            R.pass_copy.gbufs.push(tex);
            attachments.push(attachment);
        }

        // * Check for framebuffer errors
        abortIfFramebufferIncomplete(R.pass_copy.fbo);
        // * Tell the WEBGL_draw_buffers extension which FBO attachments are
        //   being used. (This extension allows for multiple render targets.)
        gl_draw_buffers.drawBuffersWEBGL(attachments);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
	
	R.pass_copyDepth.setup = function()
	{
		R.pass_copyDepth.fbo = gl.createFramebuffer();
		R.pass_copyDepth.colorTex = createAndBindColorTargetTexture(R.pass_copyDepth.fbo,
			gl_draw_buffers.COLOR_ATTACHMENT0_WEBGL);
		abortIfFramebufferIncomplete(R.pass_copyDepth.fbo);
		gl_draw_buffers.drawBuffersWEBGL([gl_draw_buffers.COLOR_ATTACHMENT0_WEBGL]);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	};

    /**
     * Create/configure framebuffer between "deferred" and "post1" stages
     */
    R.pass_deferred.setup = function() {
        // * Create the FBO
        R.pass_deferred.fbo = gl.createFramebuffer();
        // * Create, bind, and store a single color target texture for the FBO
        R.pass_deferred.colorTex = createAndBindColorTargetTexture(
            R.pass_deferred.fbo, gl_draw_buffers.COLOR_ATTACHMENT0_WEBGL);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, R.pass_copy.depthTex, 0);

        // * Check for framebuffer errors
        abortIfFramebufferIncomplete(R.pass_deferred.fbo);
        // * Tell the WEBGL_draw_buffers extension which FBO attachments are
        //   being used. (This extension allows for multiple render targets.)
        gl_draw_buffers.drawBuffersWEBGL([gl_draw_buffers.COLOR_ATTACHMENT0_WEBGL]);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
	
	R.pass_bloom.setup = function()
	{
		// ping-pong buffers for blur filerting
        R.pass_bloom.fbo0 = gl.createFramebuffer();
        R.pass_bloom.colorTex0 = createAndBindColorTargetTexture(
            R.pass_bloom.fbo0, gl_draw_buffers.COLOR_ATTACHMENT0_WEBGL);
        abortIfFramebufferIncomplete(R.pass_bloom.fbo0);
		gl_draw_buffers.drawBuffersWEBGL([gl_draw_buffers.COLOR_ATTACHMENT0_WEBGL]);
		
		R.pass_bloom.fbo1 = gl.createFramebuffer();
        R.pass_bloom.colorTex1 = createAndBindColorTargetTexture(
            R.pass_bloom.fbo1, gl_draw_buffers.COLOR_ATTACHMENT0_WEBGL);
        abortIfFramebufferIncomplete(R.pass_bloom.fbo1);
        gl_draw_buffers.drawBuffersWEBGL([gl_draw_buffers.COLOR_ATTACHMENT0_WEBGL]);
		
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    /**
     * Loads all of the shader programs used in the pipeline.
     */
    var loadAllShaderPrograms = function() {
        loadShaderProgram(gl, 'glsl/copy.vert.glsl', 'glsl/copy.frag.glsl',
            function(prog) {
                // Create an object to hold info about this shader program
                var p = { prog: prog };

                // Retrieve the uniform and attribute locations
                p.u_cameraMat = gl.getUniformLocation(prog, 'u_cameraMat');
				p.u_viewMat   = gl.getUniformLocation(prog, 'u_viewMat');
                p.u_colmap    = gl.getUniformLocation(prog, 'u_colmap');
                p.u_normap    = gl.getUniformLocation(prog, 'u_normap');
                p.a_position  = gl.getAttribLocation(prog, 'a_position');
                p.a_normal    = gl.getAttribLocation(prog, 'a_normal');
                p.a_uv        = gl.getAttribLocation(prog, 'a_uv');

                // Save the object into this variable for access later
                R.progCopy = p;
            });
			
		loadShaderProgram(gl, 'glsl/quad.vert.glsl', 'glsl/copydepth.frag.glsl',
            function(prog) {
                // Create an object to hold info about this shader program
				var p = { prog: prog };
				
				p.u_depth = gl.getUniformLocation(prog, 'u_depth');
				
                R.progCopyDepth = p;
            });

        loadShaderProgram(gl, 'glsl/quad.vert.glsl', 'glsl/red.frag.glsl',
            function(prog) {
                // Create an object to hold info about this shader program
                R.progRed = { prog: prog };
            });
			
		loadShaderProgram(gl, 'glsl/sphereproxy.vert.glsl', 'glsl/red.frag.glsl',
            function(prog) {
                // Create an object to hold info about this shader program
				var p = { prog: prog };
				
				p.u_lightPos = gl.getUniformLocation(prog, 'u_lightPos');
				p.u_lightRad = gl.getUniformLocation(prog, 'u_lightRad');
				p.u_proj = gl.getUniformLocation(prog, 'u_proj');
				
                R.progSphereRed = p;
            });

        loadShaderProgram(gl, 'glsl/quad.vert.glsl', 'glsl/clear.frag.glsl',
            function(prog) {
                // Create an object to hold info about this shader program
                R.progClear = { prog: prog };
            });

        loadDeferredProgram('ambient', function(p) {
            // Save the object into this variable for access later
            R.prog_Ambient = p;
        });

/*         loadDeferredProgram('blinnphong-pointlight', function(p) {
            // Save the object into this variable for access later
			p.u_viewportInfo = gl.getUniformLocation(p.prog, 'u_viewportInfo');
            p.u_lightPos = gl.getUniformLocation(p.prog, 'u_lightPos');
            p.u_lightCol = gl.getUniformLocation(p.prog, 'u_lightCol');
            p.u_lightRad = gl.getUniformLocation(p.prog, 'u_lightRad');
            R.prog_BlinnPhong_PointLight = p;
        }); */
		
		loadDeferredProgram_SphereProxy('blinnphong-pointlight', function(p) {
            // Save the object into this variable for access later
			p.u_proj = gl.getUniformLocation(p.prog, 'u_proj');
			p.u_viewportInfo = gl.getUniformLocation(p.prog, 'u_viewportInfo');
            p.u_lightPos = gl.getUniformLocation(p.prog, 'u_lightPos');
            p.u_lightCol = gl.getUniformLocation(p.prog, 'u_lightCol');
            p.u_lightRad = gl.getUniformLocation(p.prog, 'u_lightRad');
            R.prog_BlinnPhong_PointLight = p;
        });

        loadDeferredProgram('debug', function(p) {
			p.u_viewportInfo = gl.getUniformLocation(p.prog, 'u_viewportInfo');
            p.u_debug = gl.getUniformLocation(p.prog, 'u_debug');
            // Save the object into this variable for access later
            R.prog_Debug = p;
        });
		
        loadPostProgram('thresholdbrightness', function(p) {
			p.u_threshold = gl.getUniformLocation(p.prog, 'u_threshold');
            p.u_color    = gl.getUniformLocation(p.prog, 'u_color');
            // Save the object into this variable for access later
            R.progPostThresholdBrightness = p;
        });

        // TODO: If you add more passes, load and set up their shader programs.
		loadPostProgram('gaussianblur', function(p) {
			p.u_imgDim = gl.getUniformLocation(p.prog, 'u_imgDim');
			p.u_isHorizontal = gl.getUniformLocation(p.prog, 'u_isHorizontal');
            p.u_color    = gl.getUniformLocation(p.prog, 'u_color');
            // Save the object into this variable for access later
            R.progPostGaussianBlur = p;
        });
		
		loadPostProgram('bloomgather', function(p) {
            p.u_color    = gl.getUniformLocation(p.prog, 'u_color');
			p.u_bloomEnabled = gl.getUniformLocation(p.prog, 'u_bloomEnabled');
			p.u_brightness = gl.getUniformLocation(p.prog, 'u_brightness');
            // Save the object into this variable for access later
            R.progPostBloomGather = p;
        });
		
		loadPostProgram('motionblur', function(p) {
			p.u_scale = gl.getUniformLocation(p.prog, 'u_scale');
            p.u_color = gl.getUniformLocation(p.prog, 'u_color');
			p.u_depth = gl.getUniformLocation(p.prog, 'u_depth');
			p.u_preViewProj = gl.getUniformLocation(p.prog, 'u_preViewProj');
			p.u_viewProjInverse = gl.getUniformLocation(p.prog, 'u_viewProjInverse');
            // Save the object into this variable for access later
            R.progPostMotionBlur = p;
        });
    };

    var loadDeferredProgram = function(name, callback) {
        loadShaderProgram(gl, 'glsl/quad.vert.glsl',
                          'glsl/deferred/' + name + '.frag.glsl',
            function(prog) {
                // Create an object to hold info about this shader program
                var p = { prog: prog };

                // Retrieve the uniform and attribute locations
                p.u_gbufs = [];
                for (var i = 0; i < R.NUM_GBUFFERS; i++) {
                    p.u_gbufs[i] = gl.getUniformLocation(prog, 'u_gbufs[' + i + ']');
                }
                p.u_depth    = gl.getUniformLocation(prog, 'u_depth');
                p.a_position = gl.getAttribLocation(prog, 'a_position');

                callback(p);
            });
    };
	
	var loadDeferredProgram_SphereProxy = function(name, callback) {
        loadShaderProgram(gl, 'glsl/sphereproxy.vert.glsl',
                          'glsl/deferred/' + name + '.frag.glsl',
            function(prog) {
                // Create an object to hold info about this shader program
                var p = { prog: prog };

                // Retrieve the uniform and attribute locations
                p.u_gbufs = [];
                for (var i = 0; i < R.NUM_GBUFFERS; i++) {
                    p.u_gbufs[i] = gl.getUniformLocation(prog, 'u_gbufs[' + i + ']');
                }
                p.u_depth    = gl.getUniformLocation(prog, 'u_depth');
                p.a_position = gl.getAttribLocation(prog, 'a_position');

                callback(p);
            });
    };

    var loadPostProgram = function(name, callback) {
        loadShaderProgram(gl, 'glsl/quad.vert.glsl',
                          'glsl/post/' + name + '.frag.glsl',
            function(prog) {
                // Create an object to hold info about this shader program
                var p = { prog: prog };

                // Retrieve the uniform and attribute locations
                p.a_position = gl.getAttribLocation(prog, 'a_position');

                callback(p);
            });
    };

    var createAndBindDepthTargetTexture = function(fbo) {
        var depthTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, depthTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, width, height, 0,
            gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);

        return depthTex;
    };

    var createAndBindColorTargetTexture = function(fbo, attachment,
		componentFormat = gl.RGBA,
		componentType = gl.FLOAT)
	{
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, componentFormat, width, height, 0,
			componentFormat, componentType, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, tex, 0);

        return tex;
    };
})();
