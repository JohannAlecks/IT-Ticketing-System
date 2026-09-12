// Relation is authoritative. The legacy string is read-only fallback, not an
// alternate write API. Historical snapshots do not call this on stored cycles.
const departmentSelect = { department: true, departmentId: true, departmentRecord: { select: { id: true, name: true, isActive: true } } };
const departmentName = (user) => user?.departmentRecord?.name ?? (user?.department?.trim() || null);
const exposeDepartment = (user) => user ? { ...user, department: departmentName(user) } : user;
// Existing ticket/saved-view/report filters retain their display-name contract;
// current structured users match the canonical name, never stale legacy text.
const departmentFilter = (name) => ({ OR: [{ departmentRecord: { name } }, { departmentId: null, department: name }] });
module.exports = { departmentSelect, departmentName, exposeDepartment, departmentFilter };
