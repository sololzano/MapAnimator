# Wayline — design notes

## Route points list (Step 1)
- GPX or dense JSON imports can produce a very long point list. The importer currently caps at ~80 points (keeping named stops), but real-world tracks and longer timelines may exceed this.
- Design decision: the sidebar point list is left unchanged for short routes. When a route has more than 40 points, the list is hidden and only the count is shown ("N points — too many to list").
- Open question for production: add simplification (Douglas–Peucker tolerance slider) on import so users control how many editable points a GPX becomes.

## Map editing toolbar
- Floating, static toolbar at the top-left of the map: Draw, Move/insert, Pan, Undo, Delete selected, Zoom in/out, Fit.
- Panning also works in every tool by holding the mouse wheel button and dragging. Scroll wheel zooms.
