import type { StudioNode } from "./types";
import { textHeight, textWidth } from "./types";

export function relayoutTree(root: StudioNode): StudioNode {
  const node = cloneNode(root);
  sizeNode(node);
  placeChildren(node);
  return node;
}

function cloneNode(n: StudioNode): StudioNode {
  return {
    ...n,
    style: { ...n.style },
    text: n.text ? { ...n.text } : undefined,
    layout: n.layout ? { ...n.layout, padding: [...n.layout.padding] as [number, number, number, number] } : undefined,
    children: n.children.map(cloneNode),
  };
}

function sizeNode(n: StudioNode): void {
  n.children.forEach(sizeNode);

  if (n.sizingW === "hug" && (!n.layout || n.children.length === 0)) {
    n.width = textWidth(n);
  }
  if (n.sizingH === "hug" && (!n.layout || n.children.length === 0)) {
    n.height = textHeight(n);
  }
  if (!n.layout || n.children.length === 0) return;

  const { dir, gap, padding } = n.layout;
  const horizontal = dir === "row";
  const [pt, , pb, pl] = padding;
  const mainPad = horizontal ? pl + padding[1] : pt + pb;
  const crossPad = horizontal ? pt + pb : pl + padding[1];

  n.children.forEach((c) => {
    if (c.sizingW === "hug" && c.width === 0) c.width = textWidth(c);
    if (c.sizingH === "hug" && c.height === 0) c.height = textHeight(c);
  });

  const mainOf = (c: StudioNode) => (horizontal ? c.width : c.height);
  const crossOf = (c: StudioNode) => (horizontal ? c.height : c.width);
  const setMain = (c: StudioNode, v: number) => {
    if (horizontal) c.width = v;
    else c.height = v;
  };

  const nonFillMain = n.children
    .filter((c) => (horizontal ? c.sizingW : c.sizingH) !== "fill")
    .reduce((sum, c) => sum + mainOf(c), 0);
  const gaps = gap * Math.max(0, n.children.length - 1);

  const parentMainFixed = horizontal ? n.sizingW !== "hug" : n.sizingH !== "hug";
  let parentMain: number;
  if (parentMainFixed) {
    parentMain = mainOf(n);
  } else {
    parentMain = nonFillMain + gaps + mainPad;
    if (horizontal) n.width = parentMain;
    else n.height = parentMain;
  }

  const fillChildren = n.children.filter((c) => (horizontal ? c.sizingW : c.sizingH) === "fill");
  if (fillChildren.length > 0) {
    const remaining = Math.max(0, parentMain - mainPad - gaps - nonFillMain);
    const share = remaining / fillChildren.length;
    fillChildren.forEach((c) => setMain(c, share));
  }

  if ((horizontal ? n.sizingH : n.sizingW) === "hug") {
    const maxCross = n.children.reduce((m, c) => Math.max(m, crossOf(c)), 0);
    if (horizontal) n.height = maxCross + crossPad;
    else n.width = maxCross + crossPad;
  }
}

function placeChildren(n: StudioNode): void {
  if (!n.layout) {
    n.children.forEach(placeChildren);
    return;
  }

  const { dir, gap, padding, align, justify } = n.layout;
  const horizontal = dir === "row";
  const [pt, , , pl] = padding;
  const mainPad = horizontal ? pl : pt;
  const crossPadStart = horizontal ? pt : pl;
  const parentMain = horizontal ? n.width : n.height;
  const parentCross = horizontal ? n.height : n.width;
  const crossPadTotal = horizontal ? pt + padding[2] : pl + padding[1];

  const mainOf = (c: StudioNode) => (horizontal ? c.width : c.height);
  const crossOf = (c: StudioNode) => (horizontal ? c.height : c.width);
  const children = n.children;
  const count = children.length;

  let cursor = mainPad;
  const totalMain = children.reduce((s, c) => s + mainOf(c), 0) + gap * Math.max(0, count - 1);
  const freeMain = parentMain - totalMain - (horizontal ? padding[1] + pl : pt + padding[2]);

  if (justify === "center") cursor += Math.max(0, freeMain) / 2;
  else if (justify === "end") cursor += Math.max(0, freeMain);
  const stepGap = justify === "space-between" && count > 1 ? Math.max(0, freeMain) / (count - 1) : gap;
  children.forEach((c, i) => {
    let cross: number;
    const available = parentCross - crossPadTotal;
    if (align === "center") cross = crossPadStart + Math.max(0, (available - crossOf(c)) / 2);
    else if (align === "end") cross = crossPadStart + Math.max(0, available - crossOf(c));
    else cross = crossPadStart;

    if (horizontal) {
      c.x = cursor;
      c.y = cross;
    } else {
      c.x = cross;
      c.y = cursor;
    }
    cursor += mainOf(c) + (i < count - 1 ? stepGap : 0);
    placeChildren(c);
  });
}
