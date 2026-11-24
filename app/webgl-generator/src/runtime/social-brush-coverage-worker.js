import {summarizeSocialCoverage} from "./social-brush-coverage.js";

let input;
self.onmessage = ({data}) => {
  if (data.input) input = data.input;
  for (const [grid, owner, packCells] of data.edits || []) {
    input.grid[grid] = owner;
    for (const cell of packCells) input.owners[cell] = owner;
  }
  self.postMessage({sequence: data.sequence, coverage: summarizeSocialCoverage(input)});
};
