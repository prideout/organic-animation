var main = function() {

  // Convert markdown text to HTML.
  var converter = new Showdown.converter();
  var markdown = $.get('index.md?3', function(mdSource) {
    var html = converter.makeHtml(mdSource);
    $('#markdown-container').html(html);
  });

  // Prevent flash of unstyled content.
  $('.icon-refresh').show();
  $('.icon-spin').hide();
  $('#textures').show();

  // Create some convenient aliases.
  var gl = GIZA.init(null, {antialias: true});
  var M4 = GIZA.Matrix4;
  var C4 = GIZA.Color4;
  var V2 = GIZA.Vector2;
  var V3 = GIZA.Vector3;

  gl.clearColor(0.85, 0.875, 0.9, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Build the GLSL shader objects.

  var attribs = {
    POSITION: 0,
    ROOT_DISTANCE: 1,
    EDGE_VECTOR: 2,
    AXIS_DISTANCE: 3,
    POSITION2: 4,
    ROOT_DISTANCE2: 5,
    EDGE_VECTOR2: 6,
    AXIS_DISTANCE2: 7,
  };

  var programs = GIZA.compile({

    simple: {
      vs: ['simplevs'],
      fs: ['simplefs'],
      attribs: {
        Position: attribs.POSITION,
      }
    },

    animatedSpine: {
      vs: ['animatedvs'],
      fs: ['simplefs'],
      attribs: {
        Position1: attribs.POSITION,
        Position2: attribs.POSITION2,
      }
    },

    animatedMesh: {
      vs: ['grow-animated'],
      fs: ['gradient'],
      attribs: {
        Position1: attribs.POSITION,
        EdgeVector1: attribs.EDGE_VECTOR,
        RootDistance1: attribs.ROOT_DISTANCE,
        AxisDistance1: attribs.AXIS_DISTANCE,
        Position2: attribs.POSITION2,
        EdgeVector2: attribs.EDGE_VECTOR2,
        RootDistance2: attribs.ROOT_DISTANCE2,
        AxisDistance2: attribs.AXIS_DISTANCE2,
      }
    },

  });

  // Generate the tree.

  var treeSpine, treeMesh;

  var generate = function() {
    var config = GIZA.clone(TREE.config);
    config.curlAngle += 0.02;
    var treeDesc1 = TREE.create(config);
    var treeSpine1 = TREE.centerline(treeDesc1);
    var treeMesh1 = TREE.meshify(treeDesc1);
    config.curlAngle -= 0.04;
    var treeDesc2 = TREE.create(config);
    var treeSpine2 = TREE.centerline(treeDesc2);
    var treeMesh2 = TREE.meshify(treeDesc2);

    var animatedMesh = GIZA.interleaveBuffers([treeMesh1.data, treeMesh2.data], 24);
    var animatedSpine = GIZA.interleaveBuffers([treeSpine1.data, treeSpine2.data], 8);

    var meshBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, animatedMesh, gl.STATIC_DRAW);
  
    var spineBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, animatedSpine, gl.STATIC_DRAW);

    treeSpine = {
      spans: treeSpine1.spans,
      buffer: spineBuffer
    };
    treeMesh = {
      spans: treeMesh1.spans,
      buffer: meshBuffer
    };
  };

  generate();

  $('#refresh').click(function() {
    GIZA.restart();
  });

  // Generate the circle.
  var circle = function() {

    // Set up a description of the vertex format.
    var bufferView = new GIZA.BufferView({
      position: [Float32Array, 2],
    });

    // Allocate the memory.
    var numPoints = 64;
    var vertexArray = bufferView.makeBuffer(numPoints);

    // Initialize the center point of the wheel.
    var iterator = bufferView.iterator();
    var vertex = iterator.next();
    V2.set(vertex.position, [0, 0]);
    
    // Create the vertices along the circumference.
    var dtheta = Math.PI * 2 / (numPoints - 2);
    var theta = 0;
    var radius = 1.0;
    while (vertex = iterator.next()) {
      var x = radius * Math.cos(theta);
      var y = radius * Math.sin(theta);
      V2.set(vertex.position, [x, y]);
      theta += dtheta;
    }

    // Populate the vertex buffer object.
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);

    // Return a description of the circle.
    return {
      radius: 0.2,
      color: [0.9, 0.8, 0.3],
      state: 'start',
      numPoints: numPoints,
      buffer: buffer,
    };
  }();


  // Perform various initialization.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  //gl.enable(gl.BLEND);

  var hw = GIZA.aspect, hh = 1, hd = 10;
  var proj = M4.orthographic(-hw, hw, -hh, +hh, -hd, hd);

  var screenToWorld = function(p) {
    var size = [GIZA.canvas.width, GIZA.canvas.height];
    var center = V2.scaled(size, 0.5 / GIZA.pixelScale);
    var q = V2.subtract(p, center);
    q = V2.scaled(q, 1 / (size[1] * 0.5 / GIZA.pixelScale));
    return q;
  };

  var tween = new TWEEN.Tween( { r: 0.2 } )
    .to( { r: 0.2 }, 2000 )
    .easing( TWEEN.Easing.Elastic.InOut )
    .onUpdate(function () {
      circle.radius = this.r;
    })
    .onComplete(function() {
      circle.state = 'outside';
    })
    .start();

  GIZA.mousemove(function(position, modifiers) {
    var p = screenToWorld(position);
    var r = circle.radius;
    if (p[0] * p[0] + p[1] * p[1] < r * r) {
      circle.color = [1, 1, 0];
      circle.state = 'inside';
    } else {
      circle.color = [0.9, 0.8, 0.3];
      circle.state = 'outside';
    }
  });

  var draw = function(time) {

    gl.clear(gl.COLOR_BUFFER_BIT);

    var program = programs.simple;
    gl.useProgram(program);
    gl.uniformMatrix4fv(program.projection, false, proj);
    gl.uniform1f(program.alpha, 1.0);

    var twopi = Math.PI * 2;
    var theta = (time / 500) % twopi;
    var blend = 0.5 + 0.5 * Math.cos(theta);

    var drawMesh = true;
    if (drawMesh) {

      program = programs.animatedMesh;
      gl.useProgram(program);
      gl.uniformMatrix4fv(program.projection, false, proj);
      gl.uniform1f(program.alpha, 1.0);
      gl.uniform1f(program.blend, blend);

      var t = time / 2000;
      gl.uniform1f(program.time, t > 1 ? 1 : t);

      gl.bindBuffer(gl.ARRAY_BUFFER, treeMesh.buffer);

      gl.enableVertexAttribArray(attribs.POSITION);
      gl.vertexAttribPointer(attribs.POSITION, 2, gl.FLOAT, false, 48, 0);
      gl.enableVertexAttribArray(attribs.ROOT_DISTANCE);
      gl.vertexAttribPointer(attribs.ROOT_DISTANCE, 1, gl.FLOAT, false, 48, 8);
      gl.enableVertexAttribArray(attribs.EDGE_VECTOR);
      gl.vertexAttribPointer(attribs.EDGE_VECTOR, 2, gl.FLOAT, false, 48, 12);
      gl.enableVertexAttribArray(attribs.AXIS_DISTANCE);
      gl.vertexAttribPointer(attribs.AXIS_DISTANCE, 1, gl.FLOAT, false, 48, 20);

      gl.enableVertexAttribArray(attribs.POSITION2);
      gl.vertexAttribPointer(attribs.POSITION2, 2, gl.FLOAT, false, 48, 24+0);
      gl.enableVertexAttribArray(attribs.ROOT_DISTANCE2);
      gl.vertexAttribPointer(attribs.ROOT_DISTANCE2, 1, gl.FLOAT, false, 48, 24+8);
      gl.enableVertexAttribArray(attribs.EDGE_VECTOR2);
      gl.vertexAttribPointer(attribs.EDGE_VECTOR2, 2, gl.FLOAT, false, 48, 24+12);
      gl.enableVertexAttribArray(attribs.AXIS_DISTANCE2);
      gl.vertexAttribPointer(attribs.AXIS_DISTANCE2, 1, gl.FLOAT, false, 48, 24+20);

      var mv = M4.scale(TREE.config.scale);
      mv = M4.rotateZ(mv, TREE.config.spin);
      gl.uniformMatrix4fv(program.modelview, false, mv);

      var amber = [0.90, 0.85, 0.50];
      var black = [0.10, 0.10, 0.10];

      gl.uniform3fv(program.fill, amber);
      gl.uniform3fv(program.stroke, black);
      gl.uniform1f(program.width, 2);
      var offset = 0;
      treeMesh.spans.forEach(function(span) {
        gl.drawArrays(gl.TRIANGLE_STRIP, offset, span);
        offset += span;
      });

      gl.disableVertexAttribArray(attribs.EDGE_VECTOR);
      gl.disableVertexAttribArray(attribs.ROOT_DISTANCE);
      gl.disableVertexAttribArray(attribs.AXIS_DISTANCE);
      gl.disableVertexAttribArray(attribs.POSITION2);
      gl.disableVertexAttribArray(attribs.EDGE_VECTOR2);
      gl.disableVertexAttribArray(attribs.ROOT_DISTANCE2);
      gl.disableVertexAttribArray(attribs.AXIS_DISTANCE2);
    }

    var drawCenterline = false;
    if (drawCenterline) {

      program = programs.animatedSpine;
      gl.useProgram(program);
      gl.uniformMatrix4fv(program.projection, false, proj);
      gl.uniform1f(program.alpha, 1.0);
      gl.uniform1f(program.blend, blend);

      gl.lineWidth(4.0);
      gl.bindBuffer(gl.ARRAY_BUFFER, treeSpine.buffer);

      gl.enableVertexAttribArray(attribs.POSITION);
      gl.vertexAttribPointer(attribs.POSITION, 2, gl.FLOAT, false, 16, 0);

      gl.enableVertexAttribArray(attribs.POSITION2);
      gl.vertexAttribPointer(attribs.POSITION2, 2, gl.FLOAT, false, 16, 8);

      var mv = M4.scale(TREE.config.scale);
      mv = M4.rotateZ(mv, TREE.config.spin);
      gl.uniformMatrix4fv(program.modelview, false, mv);

      var red = [0.5, 0, 0];
      gl.uniform1f(program.alpha, 0.5);
      gl.uniform3fv(program.color, red);

      var offset = 0;
      treeSpine.spans.forEach(function(span) {
        gl.drawArrays(gl.LINE_STRIP, offset, span);
        offset += span;
      });

      gl.disableVertexAttribArray(attribs.POSITION2);
    }

    var drawCircle = true;
    if (drawCircle) {
      var program = programs.simple;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, circle.buffer);
      gl.enableVertexAttribArray(attribs.POSITION);
      gl.vertexAttribPointer(attribs.POSITION, 2, gl.FLOAT, false, 0, 0);

      // Draw the gray border.
      var s = circle.radius + 0.01 * Math.sin(time * 0.01);
      var mv = M4.scale(s);
      gl.uniformMatrix4fv(program.modelview, false, mv);
      gl.uniform3f(program.color, 0.1, 0.1, 0.1);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, circle.numPoints);

      // Draw the yellow fill.
      var mv = M4.scale(s - 0.025);
      gl.uniformMatrix4fv(program.modelview, false, mv);
      gl.uniform3fv(program.color, circle.color);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, circle.numPoints);
    }

  };

  GIZA.drawHooks.push(TWEEN.update);

  // We pause and reset the time so that users don't miss the first
  // few hundred milliseconds of animation.
  GIZA.pause();
  GIZA.animate(draw);
  GIZA.restart();
  setTimeout(GIZA.resume, 100);
};