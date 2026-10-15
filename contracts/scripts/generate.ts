import hre from "hardhat";
import { writeGenerated } from "./lib";

writeGenerated(hre).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
