function createShutdown({ server, prisma, readiness, exit = process.exit, timeoutMs = 10000 }) {
  let stopping = false;
  return (code = 0) => {
    if (stopping) return;
    stopping = true; readiness.drain();
    const timer = setTimeout(() => { server.closeAllConnections?.(); exit(1); }, timeoutMs);
    timer.unref?.();
    server.close(async () => {
      try { await prisma.$disconnect(); clearTimeout(timer); exit(code); }
      catch { clearTimeout(timer); exit(1); }
    });
    server.closeIdleConnections?.();
  };
}
module.exports = { createShutdown };
