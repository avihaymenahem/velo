
// Utility to track the last time a scroll occurred to prevent 
// "ghost" swipe events from overscroll/bounce on the edges of the list.

let lastVerticalScrollTime = 0;

export const scrollTracker = {
  markScroll() {
    lastVerticalScrollTime = Date.now();
  },
  getMillisecondsSinceLastScroll() {
    return Date.now() - lastVerticalScrollTime;
  }
};
