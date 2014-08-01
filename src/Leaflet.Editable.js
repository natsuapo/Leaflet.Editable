L.Editable = L.Class.extend({

    statics: {
        FORWARD: 1,
        BACKWARD: -1
    },

    options: {
        zIndex: 10000,
        polygonClass: L.Polygon,
        polylineClass: L.Polyline,
        markerClass: L.Marker
    },

    initialize: function (map) {
        this.map = map;
        this.editLayer = new L.LayerGroup().addTo(map);
        this.newClickHandler = L.marker(this.map.getCenter(), {
            icon: L.Browser.touch ? new L.Editable.TouchDivIcon() : new L.Editable.DivIcon(),
            opacity: 0,
            // zIndexOffset: this.options.zIndex
        });
        this.forwardLineGuide = this.createLineGuide();
        this.backwardLineGuide = this.createLineGuide();

    },

    createLineGuide: function () {
        return L.polyline([], {dashArray: '5,10', weight: 1});
    },

    moveForwardLineGuide: function (latlng) {
        if (this.forwardLineGuide._latlngs.length) {
            this.forwardLineGuide._latlngs[1] = latlng;
            this.forwardLineGuide.redraw();
        }
    },

    moveBackwardLineGuide: function (latlng) {
        if (this.backwardLineGuide._latlngs.length) {
            this.backwardLineGuide._latlngs[1] = latlng;
            this.backwardLineGuide.redraw();
        }
    },

    anchorForwardLineGuide: function (latlng) {
        this.forwardLineGuide._latlngs[0] = latlng;
        this.forwardLineGuide.redraw();
    },

    anchorBackwardLineGuide: function (latlng) {
        this.backwardLineGuide._latlngs[0] = latlng;
        this.backwardLineGuide.redraw();
    },

    attachForwardLineGuide: function () {
        this.editLayer.addLayer(this.forwardLineGuide);
    },

    attachBackwardLineGuide: function () {
        this.editLayer.addLayer(this.backwardLineGuide);
    },

    detachForwardLineGuide: function () {
        this.forwardLineGuide._latlngs = [];
        this.editLayer.removeLayer(this.forwardLineGuide);
    },

    detachBackwardLineGuide: function () {
        this.backwardLineGuide._latlngs = [];
        this.editLayer.removeLayer(this.backwardLineGuide);
    },

    registerForDrawing: function (editor) {
        this.map.on('mousemove touchmove', editor.onMouseMove, editor);
        if (this._drawingEditor) this.unregisterForDrawing(this._drawingEditor);
        this._drawingEditor = editor;
        this.editLayer.addLayer(this.newClickHandler);
        this.newClickHandler.on('click', editor.onNewClickHandlerClicked, editor);
        if (L.Browser.touch) this.map.on('click', editor.onTouch, editor);
        this.map.fire('editable:registerededitor', {editor: editor});
    },

    unregisterForDrawing: function (editor) {
        this.map.off('mousemove touchmove', editor.onMouseMove, editor);
        this.editLayer.removeLayer(this.newClickHandler);
        this.newClickHandler.off('click', editor.onNewClickHandlerClicked, editor);
        if (L.Browser.touch) this.map.off('click', editor.onTouch, editor);
        if (editor !== this._drawingEditor) return;
        delete this._drawingEditor;
        this.map.fire('editable:unregisterededitor', {editor: editor});
        if (editor.drawing) editor.finishDrawing();
    },

    startPolyline: function () {
        var line = this.createPolyline([]).connectCreatedToMap(this.map),
            editor = line.edit();
        editor.startDrawingForward();
        return line;
    },

    startPolygon: function () {
        var polygon = this.createPolygon([]).connectCreatedToMap(this.map),
            editor = polygon.edit();
        editor.startDrawingForward();
        return polygon;
    },

    startHole: function (editor) {
        editor.newHole();
    },

    extendMultiPolygon: function (multi) {
        var polygon = this.createPolygon([]);
        multi.addLayer(polygon);
        polygon.multi = multi;
        var editor = polygon.edit();
        multi.setPrimary(polygon);
        editor.startDrawingForward();
        return polygon;
    },

    startMarker: function (latlng) {
        latlng = latlng || this.map.getCenter();
        var marker = this.createMarker(latlng).connectCreatedToMap(this.map),
            editor = marker.edit();
        editor.startDrawing();
        return marker;
    },

    createPolyline: function (latlngs) {
        var line = new this.options.polylineClass(latlngs);
        this.map.fire('editable:created', {layer: line});
        return line;
    },

    createPolygon: function (latlngs) {
        var polygon = new this.options.polygonClass(latlngs);
        this.map.fire('editable:created', {layer: polygon});
        return polygon;
    },

    createMarker: function (latlng) {
        var marker = new this.options.markerClass(latlng);
        this.map.fire('editable:created', {layer: marker});
        return marker;
    }

});

L.Map.addInitHook(function () {

    this.whenReady(function () {
        if (this.options.allowEdit) {
            this.editTools = new L.Editable(this, this.editOptions);
        }
    });

});

L.Editable.DivIcon = L.DivIcon.extend({

    options: {
        iconSize: new L.Point(8, 8),
        className: 'leaflet-div-icon leaflet-editing-icon'
    }

});

L.Editable.TouchDivIcon = L.Editable.DivIcon.extend({

    options: {
        iconSize: new L.Point(20, 20)
    }

});


L.Editable.VertexMarker = L.Marker.extend({

    options: {
        draggable: true,
        riseOnOver: true,
        icon: L.Browser.touch ? new L.Editable.TouchDivIcon() : new L.Editable.DivIcon(),
        zIndex: 10001
    },

    initialize: function (latlng, latlngs, editor, options) {
        this.latlng = latlng;
        this.latlngs = latlngs;
        this.editor = editor;
        L.setOptions(this, options);
        L.Marker.prototype.initialize.call(this, latlng);
        if (this.editor.secondary) this.setSecondary();
        this.latlng.__vertex = this;
        this.editor.editLayer.addLayer(this);
    },

    setSecondary: function () {
        this.setOpacity(0.3);
    },

    setPrimary: function () {
        this.setOpacity(1);
    },

    onAdd: function (map) {
        L.Marker.prototype.onAdd.call(this, map);
        L.DomEvent.on(this.dragging._draggable, 'drag', this.onDrag, this);
        this.on('click', this.onClick);
        this.on('mousedown touchstart', this.onMouseDown);
        this.addMiddleMarkers();
    },

    onDrag: function (e) {
        var iconPos = L.DomUtil.getPosition(this._icon),
            latlng = this._map.layerPointToLatLng(iconPos);
        this.latlng.lat = latlng.lat;
        this.latlng.lng = latlng.lng;
        this.editor.feature.redraw();
        if (this.middleMarker) {
            this.middleMarker.updateLatLng();
        }
        var next = this.getNext();
        if (next && next.middleMarker) {
            next.middleMarker.updateLatLng();
        }
    },

    onClick: function (e) {
        this.editor.onVertexMarkerClick(e, this);
    },

    onMouseDown: function (e) {
        if (this.editor.secondary) {
            this.editor.setPrimary();
        }
    },

    remove: function () {
        var next = this.getNext();
        if (this.middleMarker) this.middleMarker.remove();
        delete this.latlng.__vertex;
        this.latlngs.splice(this.latlngs.indexOf(this.latlng), 1);
        if (next) next.resetMiddleMarker();
    },

    getPosition: function () {
        return this.latlngs.indexOf(this.latlng);
    },

    getLastIndex: function () {
        return this.latlngs.length - 1;
    },

    getPrevious: function () {
        if (this.latlngs.length < 2) return;
        var position = this.getPosition(),
            previousPosition = position - 1;
        if (position === 0 && this.editor.CLOSED) previousPosition = this.getLastIndex();
        var previous = this.latlngs[previousPosition];
        if (previous) return previous.__vertex;
    },

    getNext: function () {
        if (this.latlngs.length < 2) return;
        var position = this.getPosition(),
            nextPosition = position + 1;
        if (position === this.getLastIndex() && this.editor.CLOSED) nextPosition = 0;
        var next = this.latlngs[nextPosition];
        if (next) return next.__vertex;
    },

    addMiddleMarker: function (previous) {
        previous = previous || this.getPrevious();
        if (previous && !this.middleMarker) this.middleMarker = this.editor.addMiddleMarker(previous, this, this.latlngs, this.editor);
    },

    addMiddleMarkers: function () {
        var previous = this.getPrevious();
        if (previous) {
            this.addMiddleMarker(previous);
        }
        var next = this.getNext();
        if (next) {
            next.resetMiddleMarker();
        }
    },

    resetMiddleMarker: function () {
        if (this.middleMarker) this.middleMarker.remove();
        this.addMiddleMarker();
    },

    _initInteraction: function () {
        L.Marker.prototype._initInteraction.call(this);
        L.DomEvent.on(this._icon, 'touchstart', function (e) {this._fireMouseEvent(e);}, this);
    }

});

L.Editable.mergeOptions({
    vertexMarkerClass: L.Editable.VertexMarker
});

L.Editable.MiddleMarker = L.Marker.extend({

    options: {
        icon: L.Browser.touch ? new L.Editable.TouchDivIcon() : new L.Editable.DivIcon(),
        zIndex: 10000,
        opacity: 0.5
    },

    initialize: function (left, right, latlngs, editor, options) {
        this.left = left;
        this.right = right;
        this.editor = editor;
        this.latlngs = latlngs;
        L.Marker.prototype.initialize.call(this, this.computeLatLng());
        if (this.editor.secondary) this.setSecondary();
        this.editor.editLayer.addLayer(this);
    },

    setSecondary: function () {
        this.setOpacity(0.2);
    },

    setPrimary: function () {
        this.setOpacity(this.options.opacity);
    },

    updateLatLng: function () {
        this.setLatLng(this.computeLatLng());
    },

    computeLatLng: function () {
        var lat = (this.left.latlng.lat + this.right.latlng.lat) / 2,
            lng = (this.left.latlng.lng + this.right.latlng.lng) / 2;
        return [lat, lng];
    },

    onAdd: function (map) {
        L.Marker.prototype.onAdd.call(this, map);
        this.on('mousedown touchstart', this.onMouseDown);
    },

    onMouseDown: function (e) {
        this.latlngs.splice(this.index(), 0, e.latlng);
        this.editor.feature.redraw();
        this.editor.setPrimary();
        this.remove();
        var marker = this.editor.addVertexMarker(e.latlng, this.latlngs);
        marker.dragging._draggable._onDown(e.originalEvent);  // Transfer ongoing dragging to real marker
    },

    remove: function () {
        this.editor.editLayer.removeLayer(this);
        delete this.right.middleMarker;
    },

    index: function () {
        return this.latlngs.indexOf(this.right.latlng);
    },

    _initInteraction: function () {
        L.Marker.prototype._initInteraction.call(this);
        L.DomEvent.on(this._icon, 'touchstart', function (e) {this._fireMouseEvent(e);}, this);
    }

});

L.Editable.mergeOptions({
    middleMarkerClass: L.Editable.MiddleMarker
});

L.Editable.BaseEditor = L.Class.extend({

    initialize: function (map, feature, options) {
        L.setOptions(this, options);
        this.map = map;
        this.feature = feature;
        this.feature.editor = this;
        this.editLayer = new L.LayerGroup();
        this.tools = this.options.tools || map.editTools;
    },

    enable: function () {
        this.tools.editLayer.addLayer(this.editLayer);
        this.onEnable();
        return this;
    },

    disable: function () {
        this.editLayer.clearLayers();
        this.tools.editLayer.removeLayer(this.editLayer);
        this.onDisable();
        return this;
    },

    onEnable: function () {
        this.map.fire('editable:enable', {layer: this.feature});
    },

    onDisable: function () {
        this.map.fire('editable:disable', {layer: this.feature});
    },

    onEditing: function () {
        this.map.fire('editable:editing', {layer: this.feature});
    },

    onEdited: function () {
        this.map.fire('editable:edited', {layer: this.feature});
    },

    startDrawing: function () {
        if (!this.drawing) this.drawing = L.Editable.FORWARD;
        this.tools.registerForDrawing(this);
        this.onEditing();
    },

    finishDrawing: function () {
        this.onEdited();
        this.drawing = false;
        this.tools.unregisterForDrawing(this);
    },

    onMouseMove: function (e) {
        if (this.drawing) {
            this.tools.newClickHandler.setLatLng(e.latlng);
        }
    },

    onTouch: function (e) {
        this.onMouseMove(e);
        if (this.drawing) this.tools.newClickHandler._fireMouseEvent(e);
    }

});

L.Editable.MarkerEditor = L.Editable.BaseEditor.extend({

    enable: function () {
        L.Editable.BaseEditor.prototype.enable.call(this);
        this.feature.dragging.enable();
        this.feature.on('dragstart', this.onEditing, this);
        return this;
    },

    disable: function () {
        L.Editable.BaseEditor.prototype.disable.call(this);
        this.feature.dragging.disable();
        this.feature.off('dragstart', this.onEditing, this);
        return this;
    },

    onMouseMove: function (e) {
        if (this.drawing) {
            L.Editable.BaseEditor.prototype.onMouseMove.call(this, e);
            this.feature.setLatLng(e.latlng);
            this.tools.newClickHandler._bringToFront();
        }
    },

    onNewClickHandlerClicked: function (e) {
        if (this.checkAddConstraints && !this.checkAddConstraints(e.latlng)) {
            return;
        }
        this.finishDrawing();
    }

});

L.Editable.PathEditor = L.Editable.BaseEditor.extend({

    CLOSED: false,

    enable: function (secondary) {
        L.Editable.BaseEditor.prototype.enable.call(this);
        this.secondary = secondary;
        if (this.feature) {
            this.initVertexMarkers();
        }
        return this;
    },

    disable: function () {
        L.Editable.BaseEditor.prototype.disable.call(this);
    },

    setPrimary: function () {
        if (this.feature.multi) {
            this.feature.multi.setSecondary(this.feature);
        }
        delete this.secondary;
        this.editLayer.eachLayer(function (layer) {
            layer.setPrimary();
        });
    },

    setSecondary: function () {
        this.secondary = true;
        this.editLayer.eachLayer(function (layer) {
            if (layer.setSecondary) layer.setSecondary();
        });
    },

    initVertexMarkers: function () {
        // groups can be only latlngs (for polyline or symple polygon,
        // or latlngs plus many holes, in case of a complex polygon)
        var latLngGroups = this.getLatLngsGroups();
        for (var i = 0; i < latLngGroups.length; i++) {
            this.addVertexMarkers(latLngGroups[i]);
        }
    },

    addVertexMarker: function (latlng, latlngs) {
        return new this.tools.options.vertexMarkerClass(latlng, latlngs, this);
    },

    addVertexMarkers: function (latlngs) {
        for (var i = 0; i < latlngs.length; i++) {
            this.addVertexMarker(latlngs[i], latlngs);
        }
    },

    onVertexMarkerClick: function (e, vertex) {
        var position = vertex.getPosition();
        if (e.originalEvent.ctrlKey) {
            this.onVertexMarkerCtrlClick(e, vertex, position);
        } else if (e.originalEvent.altKey) {
            this.onVertexMarkerAltClick(e, vertex, position);
        } else if (e.originalEvent.shiftKey) {
            this.onVertexMarkerShiftClick(e, vertex, position);
        } else if (position >= 1 && position === vertex.getLastIndex() && this.drawing === L.Editable.FORWARD) {
            this.finishDrawing();
        } else if (position === 0 && this.drawing === L.Editable.BACKWARD && this.activeLatLngs.length >= 2) {
            this.finishDrawing();
        } else {
            this.onVertexRawMarkerClick(e, vertex, position);
        }
    },

    onVertexRawMarkerClick: function (e, vertex, position) {
        vertex.remove();
        this.editLayer.removeLayer(vertex);
        this.feature.redraw();
    },

    onVertexMarkerCtrlClick: function (e, vertex, position) {
        this.feature.fire('editable:vertexctrlclick', {
            originalEvent: e.originalEvent,
            latlng: e.latlng,
            vertex: vertex,
            position: position
        });
    },

    onVertexMarkerShiftClick: function (e, vertex, position) {
        this.feature.fire('editable:vertexshiftclick', {
            originalEvent: e.originalEvent,
            latlng: e.latlng,
            vertex: vertex,
            position: position
        });
    },

    onVertexMarkerAltClick: function (e, vertex, position) {
        this.feature.fire('editable:vertexaltclick', {
            originalEvent: e.originalEvent,
            latlng: e.latlng,
            vertex: vertex,
            position: position
        });
    },

    addMiddleMarker: function (left, right, latlngs) {
        return new this.tools.options.middleMarkerClass(left, right, latlngs, this);
    },

    startDrawingForward: function () {
        this.startDrawing();
        this.tools.attachForwardLineGuide();
    },

    finishDrawing: function () {
        L.Editable.BaseEditor.prototype.finishDrawing.call(this);
        this.tools.detachForwardLineGuide();
        this.tools.detachBackwardLineGuide();
        this.unsetActiveLatLngs();
        delete this.checkConstraints;
    },

    addLatLng: function (latlng) {
        this.setActiveLatLngs(latlng);
        if (this.drawing === L.Editable.FORWARD) this.activeLatLngs.push(latlng);
        else this.activeLatLngs.unshift(latlng);
        this.feature.redraw();
        this.addVertexMarker(latlng, this.activeLatLngs);
    },

    newPointForward: function (latlng) {
        this.addLatLng(latlng);
        this.tools.anchorForwardLineGuide(latlng);
    },

    newPointBackward: function (latlng) {
        this.addLatLng(latlng);
        this.tools.anchorBackwardLineGuide(latlng);
    },

    onNewClickHandlerClicked: function (e) {
        if (this.checkAddConstraints && !this.checkAddConstraints(e.latlng)) {
            return;
        }
        if (this.drawing === L.Editable.FORWARD) this.newPointForward(e.latlng);
        else this.newPointBackward(e.latlng);
        if (!this.tools.backwardLineGuide._latlngs[0]) {
            this.tools.anchorBackwardLineGuide(e.latlng);
        }
        this.feature.fire('editable:newclick', e);
    },

    setActiveLatLngs: function (latlng) {
        if (!this.activeLatLngs) {
            this.activeLatLngs = this.getLatLngs(latlng);
        }        
    },

    unsetActiveLatLngs: function () {
        delete this.activeLatLngs;
    },

    onMouseMove: function (e) {
        if (this.drawing) {
            L.Editable.BaseEditor.prototype.onMouseMove.call(this, e);
            this.tools.moveForwardLineGuide(e.latlng);
            this.tools.moveBackwardLineGuide(e.latlng);
        }
    }

});

L.Editable.PolylineEditor = L.Editable.PathEditor.extend({

    getLatLngsGroups: function () {
        return [this.getLatLngs()];
    },

    getLatLngs: function () {
        return this.feature.getLatLngs();
    },

    startDrawingBackward: function () {
        this.drawing = L.Editable.BACKWARD;
        this.startDrawing();
        this.tools.attachBackwardLineGuide();
    },

    continueBackward: function () {
        this.tools.anchorBackwardLineGuide(this.getFirstLatLng());
        this.startDrawingBackward();
    },

    continueForward: function () {
        this.tools.anchorForwardLineGuide(this.getLastLatLng());
        this.startDrawingForward();
    },

    getLastLatLng: function () {
        return this.getLatLngs()[this.getLatLngs().length - 1];
    },

    getFirstLatLng: function () {
        return this.getLatLngs()[0];
    }

});

L.Editable.PolygonEditor = L.Editable.PathEditor.extend({

    CLOSED: true,

    getLatLngsGroups: function () {
        var groups = [this.feature._latlngs];
        if (this.feature._holes) {
            for (var i = 0; i < this.feature._holes.length; i++) {
                groups.push(this.feature._holes[i]);
            }
        }
        return groups;
    },

    startDrawingForward: function () {
        L.Editable.PathEditor.prototype.startDrawingForward.call(this);
        this.tools.attachBackwardLineGuide();
    },

    finishDrawing: function () {
        L.Editable.PathEditor.prototype.finishDrawing.call(this);
        this.tools.detachBackwardLineGuide();
    },

    getLatLngs: function (latlng) {
        if (latlng) {
            var p = this.map.latLngToLayerPoint(latlng);
            if (this.feature._latlngs && this.feature._holes && this.feature._containsPoint(p)) {
                return this.addNewEmptyHole();
            }
        }
        return this.feature._latlngs;
    },

    addNewEmptyHole: function () {
        var holes = Array();
        if (!this.feature._holes) {
            this.feature._holes = [];
        }
        this.feature._holes.push(holes);
        return holes;
    },

    prepareForNewHole: function () {
        this.activeLatLngs = this.addNewEmptyHole();
        this.checkAddConstraints = this.checkContains;
    },

    newHole: function () {
        this.prepareForNewHole();
        this.startDrawingForward();
    },

    checkContains: function (latlng) {
        return this.feature._containsPoint(this.map.latLngToLayerPoint(latlng));
    }

});

L.Map.mergeOptions({
    polylineEditorClass: L.Editable.PolylineEditor
});

L.Map.mergeOptions({
    polygonEditorClass: L.Editable.PolygonEditor
});

L.Map.mergeOptions({
    markerEditorClass: L.Editable.MarkerEditor
});

var EditableMixin = {

    createEditor: function (map) {
        map = map || this._map;
        var Klass = this.options.editorClass || this.getEditorClass(map);
        return new Klass(map, this);
    },

    edit: function (secondary) {
        return this.createEditor().enable(secondary);
    },

    endEdit: function () {
        if (this.editor) {
            this.editor.disable();
            delete this.editor;
        }
    },

    toggleEdit: function () {
      if (this.editor) {
        this.endEdit();
      } else {
        this.edit();
      }
    },

    connectCreatedToMap: function (map) {
        return this.addTo(map);
    }

};

L.Polyline.include(EditableMixin);
L.Polygon.include(EditableMixin);
L.Marker.include(EditableMixin);

L.Polyline.include({

    _containsPoint: function (p, closed) {  // Copy-pasted from Leaflet
        var i, j, k, len, len2, dist, part,
            w = this.options.weight / 2;

        if (L.Browser.touch) {
            w += 10; // polyline click tolerance on touch devices
        }

        for (i = 0, len = this._parts.length; i < len; i++) {
            part = this._parts[i];
            for (j = 0, len2 = part.length, k = len2 - 1; j < len2; k = j++) {
                if (!closed && (j === 0)) {
                    continue;
                }

                dist = L.LineUtil.pointToSegmentDistance(p, part[k], part[j]);

                if (dist <= w) {
                    return true;
                }
            }
        }
        return false;
    },

    getEditorClass: function (map) {
        return map.options.polylineEditorClass;
    }

});
L.Polygon.include({

    _containsPoint: function (p) {  // Copy-pasted from Leaflet
        var inside = false,
            part, p1, p2,
            i, j, k,
            len, len2;

        // TODO optimization: check if within bounds first

        if (L.Polyline.prototype._containsPoint.call(this, p, true)) {
            // click on polygon border
            return true;
        }

        // ray casting algorithm for detecting if point is in polygon

        for (i = 0, len = this._parts.length; i < len; i++) {
            part = this._parts[i];

            for (j = 0, len2 = part.length, k = len2 - 1; j < len2; k = j++) {
                p1 = part[j];
                p2 = part[k];

                if (((p1.y > p.y) !== (p2.y > p.y)) &&
                        (p.x < (p2.x - p1.x) * (p.y - p1.y) / (p2.y - p1.y) + p1.x)) {
                    inside = !inside;
                }
            }
        }

        return inside;
    },

    getEditorClass: function (map) {
        return map.options.polygonEditorClass;
    }

});

L.Marker.include({

    getEditorClass: function (map) {
        return map.options.markerEditorClass;
    }

});

var MultiEditableMixin = {

    edit: function (e) {
        this.eachLayer(function(layer) {
            layer.multi = this;
            layer.endEdit();
            layer.edit(e.layer !== layer);
        }, this);
    },

    endEdit: function () {
        this.eachLayer(function(layer) {
            layer.endEdit();
        });
    },

    toggleEdit: function (e) {
        if (!e.layer.editor || e.layer.editor.secondary) {
            this.edit(e);
        } else {
            this.endEdit();
        }
    },

    setPrimary: function (primary) {
        this.eachLayer(function (layer) {
            if (layer === primary) layer.editor.setPrimary();
            else layer.editor.setSecondary();
        });
    },

    setSecondary: function (except) {
        this.eachLayer(function (layer) {
            if (layer !== except) layer.editor.setSecondary();
        });
    }

};
L.MultiPolygon.include(MultiEditableMixin);
L.MultiPolyline.include(MultiEditableMixin);
