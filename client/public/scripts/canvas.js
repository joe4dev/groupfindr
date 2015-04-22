$(function(){
    var socket = io();
    var ownPlayer;      // Holds the own players player object
    var players = {};   // Contains all player objects (incl. own)

    // Set up stage (canvas)
    var stage = new createjs.Stage('mycanvas');
    var update = true;  // Whenever we set this to true, in the next tick
                        // the stage will be updated. This way we only update
                        // the canvas if there is a change.

    stage.enableMouseOver();
    createjs.Touch.enable(stage);

    // Register 'tick' function, which is called multiple times
    // depending on framerate. We update the canvas, if update is
    // set to true and set it back to false. This way we avoid
    // expensive screen updates.
    createjs.Ticker.addEventListener("tick", function(event) {
        if (update) {
            update = false; // Only update once
            stage.update(event);
        }
    });


    /*
    Class Player
    Class representing any player in the room/game.

    @member: id         The id of the player, set to the id given by the socket
    @member: username   Readable name of user (string)
    @member: shape      Shape object generated by create.js. (http://www.createjs.com/EaselJS)
                        Represents object on screen. Currently a simple circle.


    @fun: getPos                Returns position vector in format { x:356, y:689 }
    @fun: setPos(xpos, ypos)    Set's the position of the shape and updates screen.
    @fun: remove()              Removes the shape of the player and un-registers it
                                from the 'players' map. Called when other players leave.

     */
    function Player(id, xpos, ypos, username, color) {
        this.id = id;
        this.username = username;

        // Create new circle for player (potential performance gain here,
        // since we can actually reuse shapes when all other players look
        // the same etc. See caching in EaselJS.
        this.shape = new createjs.Container();
        this.shape.player = this;
        var circle = new createjs.Shape();  //
        circle.graphics.beginFill(color);
        circle.graphics.drawCircle(0,0,40);
        var title = new createjs.Text(this.username, "18px Arial", "#FFFFFF");
        title.x = -title.getMeasuredWidth() / 2;
        title.y = -title.getMeasuredLineHeight() / 2;
        this.shape.addChild(circle, title);
        stage.addChild(this.shape);
        this.setPos(xpos, ypos);
    }
    Player.prototype = {
        constructor: Player,
        getPos: function() {
            return { x: this.shape.x, y: this.shape.y };
        },
        setPos: function(xpos, ypos) {
            this.shape.x = xpos;
            this.shape.y = ypos;
            update = true;
        },
        remove: function() {
            var id = this.id;
            stage.removeChild(this.shape);
            delete players[id];
            update = true;

        }
    }

    /*
     Class OwnPlayer extends Player
     Class representing own player object. Inherits all functionality from Player class
     but adds mouse drag and drop functionality, so the player can move the object around.

     Also emits any position change back to the server, so other players receive the update.
     */
    function OwnPlayer(id, xpos, ypos, username, color) {
        this.base = Player;
        this.base(id, xpos, ypos, username, color); // Call superclass constructor

        // Setup mouse handlers
        this.shape.on("mousedown", function (evt) {
            this.parent.addChild(this);
            this.offset = {x: this.x - evt.stageX, y: this.y - evt.stageY};
        });
        this.shape.on('pressmove', function (evt) {
            this.player.setPos(evt.stageX + this.offset.x, evt.stageY + this.offset.y);
        });

        //setup key event handling, to be able to walk with the keys
        var that = this;
        $(document).keydown(function(event){
            var step = 5;
            switch (event.keyCode){
                case 37: // left arrow
                    that.setPos(that.getPos().x - step, that.getPos().y);
                    break;
                case 38: // up arrow
                    that.setPos(that.getPos().x, that.getPos().y - step);
                    break;
                case 39: // right arrow
                    that.setPos(that.getPos().x + step, that.getPos().y);
                    break;
                case 40: // down arrow
                    that.setPos(that.getPos().x, that.getPos().y + step);
            }
        });


    }
    OwnPlayer.prototype = new Player;

    // Overwrite the setPos function (emit new position along with redraw)
    OwnPlayer.prototype.setPos = function(xpos, ypos) {
        this.shape.x = xpos;
        this.shape.y = ypos;
        update = true;
        var pos = this.getPos();

        socket.emit('updatepos', pos );
    };

    /**
     * Incoming socket call: called when the server sends a new update.
     * Contains data about 1 player with id, username, x and y.
     */
    socket.on('update', function(newPos) {
        // We ignore update about ourself. But could be used to verify if
        // the server is in sync with own position. E.g. too big delta ->
        // our position is resetted to the server's state.
        if (newPos.id === socket.id) return;

        // Update player if we know about him, else create a new game object
        if (newPos.id in players) {
            players[newPos.id].setPos(newPos.x, newPos.y);
        } else {
            players[newPos.id] = new Player(newPos.id, newPos.x, newPos.y, newPos.username, 'black');
        }

    });

    /**
     * Incoming socket call: called when a player leaves. Removes him
     * from the screen and map.
     */
    socket.on('remove', function(playerID) {
        if (players[playerID]) {
            players[playerID].remove();
        }
    });



    /**
     *  Login Formula clicked: Hide form, show canvas and create new game object.
     *  */
    $('#joinform').submit(function(e) {
        e.preventDefault();
        var param = {};
        param.username = $('#username').val();
        param.room = $('#room').val();
        param.x = 300;  // Spawn position
        param.y = 300;
        socket.emit('login', param );
        $('#joinform').hide( "fade", function() {
            $('#mycanvas').fadeIn(200);
            ownPlayer = new OwnPlayer(socket.id, param.x, param.y, param.username, 'red');
            players[ownPlayer.id] = ownPlayer; // Save game object in global map of player objects.
        } );
    });


});