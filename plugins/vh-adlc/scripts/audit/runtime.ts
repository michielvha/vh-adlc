export function requireAuditRuntime(runtime: {version:string;markdown?:{render?:unknown}} = Bun) {
  const version=runtime.version.match(/^(\d+)\.(\d+)\./);
  if(!version||Number(version[1])<1||Number(version[1])===1&&Number(version[2])<4||typeof runtime.markdown?.render!=="function")
    throw Error("audit requires Bun 1.4+ with Bun.markdown.render; upgrade Bun before using this operation");
}
