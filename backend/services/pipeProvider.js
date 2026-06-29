import * as transformers from "@xenova/transformers";

let pipe;

export async function getPipe() {
  if (!pipe) {
    pipe = await transformers.pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
  }
  return pipe;
}


export const pipeOptions = {
  pooling: "cls", 
  normalize: true, 
};
