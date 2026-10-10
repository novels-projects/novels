import React, { useState, useEffect, useMemo } from "react";
import {
    Plus,
    Edit,
    Trash2,
    FolderTree,
    AlertTriangle,
    Loader2,
    X,
    Check,
    Inbox,
    Search,
    ChevronLeft,
    ChevronRight,
    RotateCcw,
    Tag
} from "lucide-react";
import "./AdminCategoryPage.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// เช็คว่านิยายเรื่องหนึ่งผูกอยู่กับหมวดหมู่ที่ระบุหรือไม่ (รองรับหลายรูปแบบ field ที่ backend อาจส่งมา)
function novelBelongsToCategory(novel, cat) {
    const rawCats = novel.categories ?? novel.Categories ?? novel.category_ids ?? novel.CategoryIDs ?? [];
    if (!Array.isArray(rawCats)) return false;
    return rawCats.some(c => {
        if (!c) return false;
        if (typeof c === "object") {
            const catId = c.category_id ?? c.CategoryID ?? c.id;
            if (catId !== undefined && catId !== null) {
                return Number(catId) === Number(cat.category_id);
            }
            const catName = c.name ?? c.Name ?? c.title ?? c.Title ?? "";
            return String(catName).trim().toLowerCase() === String(cat.name).trim().toLowerCase();
        }
        if (typeof c === "number") {
            return Number(c) === Number(cat.category_id);
        }
        if (typeof c === "string") {
            if (/^\d+$/.test(c)) {
                return Number(c) === Number(cat.category_id);
            }
            return String(c).trim().toLowerCase() === String(cat.name).trim().toLowerCase();
        }
        return false;
    });
}



export default function AdminCategoryPage() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [searchQuery, setSearchQuery] = useState("");

    // Modal state for create/edit
    const [isMutationModalOpen, setIsMutationModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState("create"); // "create" | "edit"
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [categoryName, setCategoryName] = useState("");
    const [mutationLoading, setMutationLoading] = useState(false);
    const [mutationError, setMutationError] = useState("");

    // Modal state for delete confirmation
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    useEffect(() => {
        fetchCategories();
    }, []);

    // 🟢 1. Load categories and novels to count usages
    const fetchCategories = async () => {
        setLoading(true);
        setError("");
        try {
            const [catRes, novelRes] = await Promise.all([
                fetch(`${API_BASE_URL}/categories`),
                fetch(`${API_BASE_URL}/novels`).catch(err => {
                    console.warn("Fetch novels failed:", err);
                    return null;
                })
            ]);

            if (!catRes.ok) throw new Error("ไม่สามารถดึงข้อมูลรายการหมวดหมู่ได้");
            
            const catData = await catRes.json();
            const catList = Array.isArray(catData) ? catData : (catData.data || catData.categories || []);

            let novelList = [];
            if (novelRes && novelRes.ok) {
                const novelData = await novelRes.json();
                novelList = novelData.novels || novelData.data?.novels || novelData.data || [];
            }

            // Map counts to categories
            const mappedList = catList.map(cat => {
                const count = novelList.filter(novel => novelBelongsToCategory(novel, cat)).length;
                return {
                    ...cat,
                    novelCount: count
                };
            });

            setCategories(mappedList);
        } catch (err) {
            console.error("Fetch categories error:", err);
            setError(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
        } finally {
            setLoading(false);
        }
    };

    // 🟢 2. Clear success/error messages automatically after a timeout
    const triggerSuccess = (msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(""), 4000);
    };

    // 🟢 3. Handle auth errors (401/403)
    const handleAuthError = (status) => {
        if (status === 401) {
            localStorage.removeItem("token");
            window.location.replace("/login-register");
        } else if (status === 403) {
            setError("คุณไม่มีสิทธิ์ผู้ดูแลระบบ (Permission Denied)");
        }
    };

    // 🟢 4. Open Modal for Create or Edit
    const openMutationModal = (mode, category = null) => {
        setModalMode(mode);
        setSelectedCategory(category);
        setCategoryName(category ? category.name : "");
        setMutationError("");
        setIsMutationModalOpen(true);
    };

    // 🟢 5. Save Category (Create or Edit)
    const handleSaveCategory = async (e) => {
        if (e) e.preventDefault();
        
        const trimmedName = categoryName.trim();
        if (!trimmedName) {
            setMutationError("กรุณากรอกชื่อหมวดหมู่");
            return;
        }

        setMutationLoading(true);
        setMutationError("");
        const token = localStorage.getItem("token");

        try {
            const isEdit = modalMode === "edit";
            const url = isEdit 
                ? `${API_BASE_URL}/api/admin/categories/${selectedCategory.category_id}`
                : `${API_BASE_URL}/api/admin/categories`;
            
            const method = isEdit ? "PATCH" : "POST";

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name: trimmedName })
            });

            if (res.status === 401 || res.status === 403) {
                handleAuthError(res.status);
                setIsMutationModalOpen(false);
                return;
            }

            if (!res.ok) {
                if (res.status === 409) {
                    throw new Error("มีหมวดหมู่นี้อยู่แล้วในระบบ");
                }
                if (res.status === 400) {
                    throw new Error("ชื่อหมวดหมู่ไม่ถูกต้อง");
                }
                if (res.status === 404) {
                    throw new Error("ไม่พบหมวดหมู่นี้");
                }
                throw new Error("บันทึกหมวดหมู่ล้มเหลว");
            }

            triggerSuccess(isEdit ? "แก้ไขหมวดหมู่สำเร็จ" : "เพิ่มหมวดหมู่สำเร็จ");
            setIsMutationModalOpen(false);
            fetchCategories();
        } catch (err) {
            console.error("Mutation failed:", err);
            setMutationError(err.message || "การสื่อสารล้มเหลว");
        } finally {
            setMutationLoading(false);
        }
    };

    // 🟢 6. Open Delete Confirmation Modal
    const openDeleteModal = (category) => {
        setCategoryToDelete(category);
        setDeleteError("");
        setIsDeleteModalOpen(true);
    };

    // 🟢 7. Delete Category
    const handleDeleteCategory = async () => {
        if (!categoryToDelete) return;

        setDeleteLoading(true);
        setDeleteError("");
        const token = localStorage.getItem("token");

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/categories/${categoryToDelete.category_id}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (res.status === 401 || res.status === 403) {
                handleAuthError(res.status);
                setIsDeleteModalOpen(false);
                return;
            }

            if (!res.ok) {
                if (res.status === 409) {
                    throw new Error("ไม่สามารถลบหมวดหมู่นี้ได้ เนื่องจากยังมีการใช้งานอยู่");
                }
                if (res.status === 404) {
                    throw new Error("ไม่พบหมวดหมู่นี้ในระบบ");
                }
                throw new Error("เกิดข้อผิดพลาดในการลบหมวดหมู่");
            }

            triggerSuccess("ลบหมวดหมู่เรียบร้อยแล้ว");
            setIsDeleteModalOpen(false);
            fetchCategories();
        } catch (err) {
            console.error("Delete failed:", err);
            setDeleteError(err.message || "การสื่อสารล้มเหลว");
        } finally {
            setDeleteLoading(false);
        }
    };

    const [sortOrder, setSortOrder] = useState(null); // null | "asc" | "desc"
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const filteredCategories = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        let list = !query
            ? categories
            : categories.filter(c => 
                String(c.name ?? "").toLowerCase().includes(query) ||
                String(c.category_id).includes(query)
            );

        if (sortOrder) {
            list = [...list].sort((a, b) => {
                const diff = (a.novelCount ?? 0) - (b.novelCount ?? 0);
                return sortOrder === "asc" ? diff : -diff;
            });
        }

        return list;
    }, [categories, searchQuery, sortOrder]);

    const totalPages = Math.max(1, Math.ceil(filteredCategories.length / itemsPerPage));
    const paginatedCategories = useMemo(() => {
        const startIdx = (currentPage - 1) * itemsPerPage;
        return filteredCategories.slice(startIdx, startIdx + itemsPerPage);
    }, [filteredCategories, currentPage, itemsPerPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, sortOrder]);

    const toggleSort = () => {
        setSortOrder(prev => {
            if (prev === null) return "desc";
            if (prev === "desc") return "asc";
            return null;
        });
    };

    return (
        <div className="admin-categories-container">
            <div className="admin-categories-content">
                {/* Header */}
                <div className="admin-categories-header">
                    <div className="header-left">
                        <h1 className="admin-title">จัดการหมวดหมู่นิยาย</h1>
                        <p className="admin-subtitle">เพิ่ม แก้ไข หรือลบหมวดหมู่ของนิยายที่ใช้ในระบบ</p>
                        <svg className="header-branch-accent" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true">
                            <path d="M0 8 H70 M70 8 C 78 8, 78 2, 86 2 H130 M70 8 C 78 8, 78 14, 86 14 H130 M130 2 H200 M130 14 H160" />
                        </svg>
                    </div>
                    <button 
                        className="btn-add-category"
                        onClick={() => openMutationModal("create")}
                    >
                        <Plus size={16} />
                        <span>เพิ่มหมวดหมู่</span>
                    </button>
                </div>

                {/* Page Errors */}
                {error && (
                    <div className="admin-page-error">
                        <AlertTriangle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Toast Success Message */}
                {successMessage && (
                    <div className="admin-page-success">
                        <Check size={18} />
                        <span>{successMessage}</span>
                    </div>
                )}

                {/* Subheader with Count & Search */}
                <div className="admin-categories-subheader">
                    <div className="categories-count-pill">
                        <Tag size={18} className="count-pill-icon" />
                        <span>ทั้งหมด {categories.length} หมวดหมู่</span>
                    </div>
                    <div className="categories-search-and-clear">
                        <div className="categories-search-box">
                            <Search size={16} className="search-icon" />
                            <input 
                                type="text" 
                                placeholder="ค้นหาหมวดหมู่..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {(searchQuery.trim() !== "" || sortOrder !== null) && (
                            <button
                                type="button"
                                className="clear-filter-btn"
                                onClick={() => {
                                    setSearchQuery("");
                                    setSortOrder(null);
                                    setCurrentPage(1);
                                }}
                                title="ล้างตัวกรองทั้งหมด"
                            >
                                <RotateCcw size={13} />
                                <span>ล้างตัวกรอง</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Table Card */}
                <div className="admin-table-card">
                    {loading ? (
                        <div className="admin-table-loading">
                            <Loader2 size={24} className="spin" />
                            <span>กำลังโหลดข้อมูลหมวดหมู่...</span>
                        </div>
                    ) : categories.length === 0 ? (
                        <div className="admin-table-empty">
                            <Inbox size={32} />
                            <span>ยังไม่มีหมวดหมู่นิยายในระบบ</span>
                        </div>
                    ) : filteredCategories.length === 0 ? (
                        <div className="admin-table-empty">
                            <Inbox size={32} />
                            <span>ไม่พบหมวดหมู่ที่ตรงกับการค้นหา "{searchQuery}"</span>
                        </div>
                    ) : (
                        <>
                            <div className="admin-table-scroll-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: "12%", minWidth: "70px" }}># ID</th>
                                            <th style={{ width: "36%", minWidth: "160px" }}>ชื่อหมวดหมู่</th>
                                            <th 
                                                className="sortable-col" 
                                                onClick={toggleSort}
                                                title="คลิกเพื่อเรียงลำดับตามจำนวนนิยาย"
                                                style={{ width: "24%", minWidth: "130px" }}
                                            >
                                                จำนวนนิยาย
                                                {sortOrder === "desc" && <span className="sort-indicator"> ▼</span>}
                                                {sortOrder === "asc" && <span className="sort-indicator"> ▲</span>}
                                            </th>
                                            <th className="text-center align-center" style={{ width: "28%", minWidth: "160px" }}>การจัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedCategories.map((item) => (
                                            <tr key={item.category_id}>
                                                <td className="id-col">{item.category_id}</td>
                                                <td className="name-col">
                                                    <span className="category-tag-badge">
                                                        {item.name}
                                                    </span>
                                                </td>
                                                <td className="count-col">
                                                    <span className={`novel-count-text${(item.novelCount ?? 0) === 0 ? " is-empty" : ""}`}>
                                                        {item.novelCount ?? 0} เรื่อง
                                                    </span>
                                                </td>
                                                <td className="actions-col text-center align-center">
                                                    <div className="actions-cell action-cell-content">
                                                        <button 
                                                            className="btn-icon-action btn-edit-user"
                                                            onClick={() => openMutationModal("edit", item)}
                                                            title="แก้ไขหมวดหมู่"
                                                        >
                                                            <Edit size={14} />
                                                            <span>แก้ไข</span>
                                                        </button>
                                                        <button 
                                                            className="btn-icon-action btn-delete-user"
                                                            onClick={() => openDeleteModal(item)}
                                                            title="ลบหมวดหมู่"
                                                        >
                                                            <Trash2 size={14} />
                                                            <span>ลบ</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer Pagination Template (Image 2 style) */}
                            <div className="admin-table-footer">
                                <div className="admin-table-footer-left">
                                    <span className="admin-table-info-text">
                                        แสดง <strong>{filteredCategories.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredCategories.length)}</strong> จาก <strong>{filteredCategories.length}</strong> รายการ
                                    </span>

                                    <div className="admin-table-per-page">
                                        <span>แสดงต่อหน้า</span>
                                        <select
                                            className="admin-per-page-select"
                                            value={itemsPerPage}
                                            onChange={(e) => {
                                                setItemsPerPage(Number(e.target.value));
                                                setCurrentPage(1);
                                            }}
                                        >
                                            <option value={10}>10</option>
                                            <option value={20}>20</option>
                                            <option value={50}>50</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="admin-pagination-img2">
                                    <button
                                        type="button"
                                        className="page-btn-box"
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronLeft size={16} />
                                        <span>ก่อนหน้า</span>
                                    </button>

                                    <span className="page-indicator-text">
                                        หน้า <strong>{currentPage}</strong> จาก <strong>{totalPages}</strong>
                                    </span>

                                    <button
                                        type="button"
                                        className="page-btn-box"
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        <span>ถัดไป</span>
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 🟢 MODAL: ADD / EDIT CATEGORY */}
            {isMutationModalOpen && (
                <div className="admin-modal-overlay" onClick={() => !mutationLoading && setIsMutationModalOpen(false)}>
                    <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal__header">
                            <div>
                                <div className="admin-modal__eyebrow">
                                    {modalMode === "edit" ? `หมวดหมู่ ID: #${selectedCategory?.category_id}` : "สร้างหมวดหมู่ใหม่"}
                                </div>
                                <div className="admin-modal__heading">
                                    {modalMode === "edit" ? "แก้ไขชื่อหมวดหมู่" : "เพิ่มหมวดหมู่นิยาย"}
                                </div>
                            </div>
                            <button 
                                className="admin-modal__close" 
                                onClick={() => setIsMutationModalOpen(false)}
                                disabled={mutationLoading}
                                aria-label="ปิด"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveCategory}>
                            <div className="admin-modal__body">
                                {mutationError && (
                                    <div className="admin-modal-error">
                                        <AlertTriangle size={16} />
                                        <span>{mutationError}</span>
                                    </div>
                                )}
                                <div className="form-group">
                                    <label htmlFor="category-name-input" className="form-label">ชื่อหมวดหมู่</label>
                                    <input 
                                        type="text" 
                                        id="category-name-input"
                                        className="form-input"
                                        placeholder="ตัวอย่างเช่น แฟนตาซี, โรแมนติก, สืบสวน"
                                        value={categoryName}
                                        onChange={(e) => setCategoryName(e.target.value)}
                                        disabled={mutationLoading}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="admin-modal__footer">
                                <button 
                                    type="button" 
                                    className="btn-modal-secondary"
                                    onClick={() => setIsMutationModalOpen(false)}
                                    disabled={mutationLoading}
                                >
                                    ยกเลิก
                                </button>
                                <button 
                                    type="submit" 
                                    className="btn-modal-primary"
                                    disabled={mutationLoading}
                                >
                                    {mutationLoading ? (
                                        <>
                                            <Loader2 size={14} className="spin" />
                                            <span>{modalMode === "edit" ? "กำลังบันทึกการแก้ไข..." : "กำลังเพิ่มหมวดหมู่..."}</span>
                                        </>
                                    ) : (
                                        <span>{modalMode === "edit" ? "บันทึกการแก้ไข" : "เพิ่มหมวดหมู่"}</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 🟢 MODAL: CONFIRM DELETE */}
            {isDeleteModalOpen && (
                <div className="admin-modal-overlay" onClick={() => !deleteLoading && setIsDeleteModalOpen(false)}>
                    <div className="admin-modal admin-modal--delete" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal__header">
                            <div className="admin-modal__heading">
                                {(categoryToDelete?.novelCount ?? 0) > 0 ? "ไม่สามารถลบหมวดหมู่" : "ยืนยันการลบหมวดหมู่"}
                            </div>
                            <button 
                                className="admin-modal__close" 
                                onClick={() => setIsDeleteModalOpen(false)}
                                disabled={deleteLoading}
                                aria-label="ปิด"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="admin-modal__body">
                            {deleteError && (
                                <div className="admin-modal-error">
                                    <AlertTriangle size={16} />
                                    <span>{deleteError}</span>
                                </div>
                            )}

                            {(categoryToDelete?.novelCount ?? 0) > 0 ? (
                                <div className="delete-modal-blocked">
                                    <p className="delete-modal-desc">
                                        หมวดหมู่ “<strong>{categoryToDelete?.name}</strong>” ยังมีนิยายอยู่ {categoryToDelete?.novelCount} เรื่อง
                                    </p>
                                    <div className="delete-modal-warning">
                                        <AlertTriangle size={15} />
                                        <span>สามารถลบได้เฉพาะหมวดหมู่ที่ไม่มีนิยายอยู่ในหมวดหมู่เท่านั้น</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="delete-modal-allowed">
                                    <p className="delete-modal-desc">
                                        คุณต้องการลบหมวดหมู่ “<strong>{categoryToDelete?.name}</strong>” หรือไม่?
                                    </p>
                                    <div className="delete-modal-warning">
                                        <AlertTriangle size={15} />
                                        <span>ข้อมูลจะถูกลบถาวรและไม่สามารถกู้คืนได้</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="admin-modal__footer">
                            {(categoryToDelete?.novelCount ?? 0) > 0 ? (
                                <button 
                                    type="button" 
                                    className="btn-modal-secondary"
                                    onClick={() => setIsDeleteModalOpen(false)}
                                >
                                    ปิด
                                </button>
                            ) : (
                                <>
                                    <button 
                                        type="button" 
                                        className="btn-modal-secondary"
                                        onClick={() => setIsDeleteModalOpen(false)}
                                        disabled={deleteLoading}
                                    >
                                        ยกเลิก
                                    </button>
                                    <button 
                                        type="button" 
                                        className="btn-modal-danger"
                                        onClick={handleDeleteCategory}
                                        disabled={deleteLoading}
                                    >
                                        {deleteLoading ? (
                                            <>
                                                <Loader2 size={14} className="spin" />
                                                <span>กำลังลบหมวดหมู่...</span>
                                            </>
                                        ) : (
                                            <span>ลบหมวดหมู่</span>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}