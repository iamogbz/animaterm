const path = require("path");

const TOKEN_EXT = ".";

/**
 * Get the last file extension without the dot (.)
 * @param {string} filePath
 */
function getExtension(filePath) {
  return path.extname(filePath).substring(1);
}

/**
 * Replace or add an extension on the file path
 * @param {string} filePath full file path
 * @param {string} targetExt without the dot (.)
 */
function setExtension(filePath, targetExt) {
  const extName = path.extname(filePath);
  const indexToReplace = filePath.lastIndexOf(extName);
  return (
    filePath.substring(0, indexToReplace) +
    (targetExt && `${TOKEN_EXT}${targetExt}`)
  );
}

/**
 * Recursively merge contents of object B into object A
 * @param {*} objA
 * @param {*} objB
 */
function mergeObjects(objA, objB) {
  for (const objBKey of Object.keys(objB)) {
    const valueA = objA[objBKey];
    if (typeof valueA === "object") {
      objA[objBKey] = mergeObjects(valueA, objB[objBKey]);
    } else {
      objA[objBKey] = objB[objBKey];
    }
  }
  return objA;
}

module.exports = { getExtension, setExtension, mergeObjects };
