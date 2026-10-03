/**
 * Live values the intro timeline tweens directly (GSAP animates plain objects) and the 3D render loop reads every frame.
 * Defaults describe the finished scene, so if the intro never runs (reduced motion, return visit) the graph is complete.
 */
export const introState = {
    active: false,   // the intro owns the camera/pose and input is ignored by the stage engine
    reveal: 26,      // how many concept nodes are visible (in curriculum order)
    edges: 1,        // 0..1: how far the prerequisite links have grown
    settle: 1,       // 0 = centre-stage intro pose, 1 = resting hero pose
    spin: 0,         // extra rotation during the intro
    fade: 1,         // 0..1: the whole graph shrinks away (the draw-a-zero gate and the first title card have no graph)
    ready: false,    // the WebGL scene has rendered its first frame
    gateHand: false, // the draw-a-zero gate is showing: its hand follows the pointer
    cx: 0, cy: 0,    // the graph's centre on screen (px), so the reveal can open from it
};
