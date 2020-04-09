function getShader(canvasName, bufferName){
	const uri = 'shaderweb/' + canvasName + '/' + bufferName + '.glsl';
	console.log('uri: ' + uri);
	return fetch(uri)
		.then(
			response =>
			response.ok ? response.text() : undefined
		);
}

/*
 * returns a tagged array, each element has a name and a shader'
 * each represents a render pass. The main buffer uses the screen as a rendertarget
 */
async function getShaders(canvasName){
	const shaderNames = ['main', 'buffer1', 'common'];
	const shaderVals = await Promise.all(shaderNames.map(shader => getShader(canvasName, shader)));
	const shaders = shaderNames.map( (name, index) => ({name : name, shader: shaderVals[index]}) );
	return shaders
}

async function go(canvasName){
	//HELPERS
	function getUrlParameter(name) {
		name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
		var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
		var results = regex.exec(location.search);
		return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
	};
	function doCheck(shader, source){
		// check they compiled alright
		var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
		console.log('Shader compiled successfully?: ' + compiled);
		var compilationLog = gl.getShaderInfoLog(shader);
		console.log('Shader compiler log: ' + compilationLog);
		if (!compiled){
			console.log(source);
		}
	}
	function checkExtensions(gl){
		gl.getExtension('OES_standard_derivatives');
	}

	//END HELPERS
	console.log(canvasName);
	var canvas = document.getElementById(canvasName);
	var gl = canvas.getContext('experimental-webgl');

	checkExtensions(gl);
	/* Create and compile Shader programs */


	// Vertex shader source code
	var vertCode =
		`
	attribute vec2 coordinates;
	void main(void) {
		gl_Position = vec4(2.0*coordinates - vec2(1.0) ,0.0, 1.0);
	}
	`;

	//Create a vertex shader object
	var vertShader = gl.createShader(gl.VERTEX_SHADER);

	//Attach vertex shader source code
	gl.shaderSource(vertShader, vertCode);

	//Compile the vertex shader
	gl.compileShader(vertShader);

	doCheck(vertShader, vertCode);
	//Fragment shader source code

	var shaders = await getShaders(canvasName);
	var mainShader = shaders.find( shader => shader.name == 'main');
	var commonShader = shaders.find( shader => shader.name == 'common');

	var fragCode = `
	#extension GL_OES_standard_derivatives : enable
	precision highp float;
	uniform vec3 iResolution;
	uniform vec4 colour;
	uniform float iTime;
	// *TODO* uniform samplerXX iChannel;
	` +
	`

	void main(void) {
		gl_FragColor = colour;
	}
	`;

	// Create fragment shader object
	var fragShader = gl.createShader(gl.FRAGMENT_SHADER);

	// Attach fragment shader source code
	gl.shaderSource(fragShader, fragCode);

	// Compile the fragment shader
	gl.compileShader(fragShader);

	doCheck(fragShader, fragCode);
	// Create a shader program object to store combined shader program
	var shaderProgram = gl.createProgram();

	// Attach a vertex shader
	gl.attachShader(shaderProgram, vertShader); 

	// Attach a fragment shader
	gl.attachShader(shaderProgram, fragShader);

	// Link both programs
	gl.linkProgram(shaderProgram);


	// Use the combined shader program object
	gl.useProgram(shaderProgram);
	/* Step5: Drawing the required object (triangle) */

	var d = new Date();
	var start = d.getTime();


	function getRenderObject(vertices, renderStyle, colour){
		// Create a new buffer object
		var vertex_buffer = gl.createBuffer();

		// Bind an empty array buffer to it
		gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);

		// Pass the vertices data to the buffer
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

		return {
			vbo: vertex_buffer,
			renderStyle: renderStyle,
			size: vertices.length/2,
			colour: colour
		}
	}

	function drawRenderObject(ob){
		// Bind buffer 
		gl.bindBuffer(gl.ARRAY_BUFFER, ob.vbo);

		//Get the attribute location
		var coord = gl.getAttribLocation(shaderProgram, "coordinates");

		//point an attribute to the currently bound VBO
		gl.vertexAttribPointer(coord, 2, gl.FLOAT, false, 0, 0);

		//Enable the attribute
		gl.enableVertexAttribArray(coord);

		var colourLoc = gl.getUniformLocation(shaderProgram, "colour");
		gl.uniform4fv(colourLoc, ob.colour.elements);

		gl.drawArrays(ob.renderStyle, 0, ob.size);
	}

	function deleteBuffers(renderObjects){
		renderObjects.forEach(ob => gl.deleteBuffer(ob.vbo));
	}

	//recomputes Vertices for a path, returns the renderObjects for that path
	function recomputeVertices(vertexPath, width, colour, oldBuffers){
		// TODO this needs refactoring very soon, smells bad
		const numFanSegments = 10;
		//delete the old buffer
		//we want to bind the shader program we're using
		deleteBuffers(oldBuffers);

		var strip = [];
		var fanBeg = [];
		var fanEnd = [];
		//compute triangle strip coords
		for (i = 0; i < vertexPath.length-1; i++){
			a = vertexPath[i]
			b = vertexPath[i+1]
			ab = (b.subtract(a)).toUnitVector();

			perpendicular = ab.rotate(Math.PI/2, Vector.Zero(2));
			strip = strip.concat(a.add(perpendicular.x(width)).elements);
			strip = strip.concat(a.add(perpendicular.x(-width)).elements);
			strip = strip.concat(b.add(perpendicular.x(width)).elements);
			strip = strip.concat(b.add(perpendicular.x(-width)).elements);

			// compute fan strips, TODO merge the below code into one
			if (i == 0){
				fanBeg = a.elements;
				for (j = 0; j <= numFanSegments; j++){
					var newVector = perpendicular.rotate(Math.PI*(j/numFanSegments), Vector.Zero(2));
					fanBeg = fanBeg.concat(a.add(newVector.x(width)).elements);
				}
			}
			else if (i == vertexPath.length - 2){
				fanEnd = b.elements;
				for (j = 0; j <= numFanSegments; j++){
					var newVector = perpendicular.rotate(Math.PI*(-j/numFanSegments), Vector.Zero(2)); //TODO this is mostly duplicate code of that above :(
					fanEnd = fanEnd.concat(b.add(newVector.x(width)).elements);
				}
			}
		}
		renderObjects = [
			getRenderObject(strip, gl.TRIANGLE_STRIP, colour),
			getRenderObject(fanBeg, gl.TRIANGLE_FAN, colour),
			getRenderObject(fanEnd, gl.TRIANGLE_FAN, colour)
		];
		return renderObjects;
	}

	var path = [
		$V([0.1, 0.1]), 
		$V([0.2, 0.7]), 
		$V([0.9, 0.9])
	];

	function getMousePosition(canvas, event) { 
		let rect = canvas.getBoundingClientRect(); 
		let x = (event.clientX - rect.left)/(canvas.width);
		let y = 1.0 - (event.clientY - rect.top)/(canvas.height);
		return $V([x, y]);
	} 

	var renderObjects = [];
	canvas.addEventListener("mousedown", function(e) 
		{ 
			path.push(getMousePosition(canvas, e));
			renderObjects = recomputeVertices(path, 0.01, $V([0.1, 0.8, 0.8, 1.0]), renderObjects);
		}); 

	function renderLoop(){
		var d = new Date();
		var millis = (new Date()).getTime();

		// Clear the canvas
		gl.clearColor(0.8, 0.5, 0.5, 1.0);

		// Enable the depth test
		gl.enable(gl.DEPTH_TEST); 

		// Clear the color buffer bit
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		// Set the view port
		gl.viewport(0,0,canvas.width,canvas.height);

		// DO UNIFORMS
		var resolutionLoc = gl.getUniformLocation(shaderProgram, "iResolution");
		gl.uniform3fv(resolutionLoc, [canvas.width, canvas.height, 0.0]); 
		var timeLoc = gl.getUniformLocation(shaderProgram, "iTime");
		gl.uniform1fv(timeLoc, [(millis-start)/1000.0]);

		// Draw the triangle
		renderObjects.forEach(ob => drawRenderObject(ob));
		window.setTimeout(renderLoop, 1000.0/60.0);
	}
	renderLoop();
	//TODO, continue fan code. You haven't tested it yet, and you havent tested the object being used to pass around buffer references
}
