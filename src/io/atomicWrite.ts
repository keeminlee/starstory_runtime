import fs from "node:fs";
import path from "node:path";

export function writeFileAtomic(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  const tempPath = path.join(dir, `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}`);

  const fd = fs.openSync(tempPath, "w");
  try {
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  try {
    fs.renameSync(tempPath, targetPath);
  } catch {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(tempPath, targetPath);
  }
}