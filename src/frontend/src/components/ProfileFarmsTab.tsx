import { useState } from 'preact/hooks';
import type { FarmRole } from '@litcrop/shared';
import { DEMO_FARM_ID } from '@litcrop/shared';
import type { FarmMemberItem } from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import type { getCurrentUser } from '../lib/auth';
import type { FarmWithRole } from './FarmSwitcher';
import FarmWizard from './FarmWizard';
import FarmDiscovery from './FarmDiscovery';
import JoinRequestList from './JoinRequestList';
import Avatar from './Avatar';
import FarmLocationMap from './FarmLocationMap';

interface ProfileFarmsTabProps {
  farms: FarmWithRole[];
  loading: boolean;
  activeFarmId: string;
  pendingCounts: Record<string, number>;
  canCreateFarm: boolean;
  atFarmLimit: boolean;
  showWizard: boolean;
  onShowWizard: (v: boolean) => void;
  onSwitchFarm: (id: string) => void;
  onDeleteFarm: (id: string) => void;
  onLeaveFarm: (id: string) => void;
  onWizardComplete: (id: string) => void;
  onSaveFarmName: (id: string, name: string) => Promise<void>;
  onToggleFarmDetail: (id: string) => void;
  onChangeMemberRole: (farmId: string, userId: string, role: FarmRole) => Promise<void>;
  onUpdateFarmVisibility: (farmId: string, visibility: 'public' | 'private') => Promise<void>;
  expandedFarm: string | null;
  farmMembers: FarmMemberItem[] | null;
  detailLoading: boolean;
  confirmDelete: string | null;
  setConfirmDelete: (id: string | null) => void;
  confirmLeave: string | null;
  setConfirmLeave: (id: string | null) => void;
  confirmRoleChange: { userId: string; action: 'promote' | 'demote' } | null;
  setConfirmRoleChange: (v: { userId: string; action: 'promote' | 'demote' } | null) => void;
  currentUser: ReturnType<typeof getCurrentUser>;
  isSystemAdmin: boolean;
}

export default function ProfileFarmsTab({
  farms,
  loading,
  activeFarmId,
  pendingCounts,
  canCreateFarm,
  atFarmLimit,
  showWizard,
  onShowWizard,
  onSwitchFarm,
  onDeleteFarm,
  onLeaveFarm,
  onWizardComplete,
  onSaveFarmName,
  onToggleFarmDetail,
  onChangeMemberRole,
  onUpdateFarmVisibility,
  expandedFarm,
  farmMembers,
  detailLoading,
  confirmDelete,
  setConfirmDelete,
  confirmLeave,
  setConfirmLeave,
  confirmRoleChange,
  setConfirmRoleChange,
  currentUser,
  isSystemAdmin,
}: ProfileFarmsTabProps) {
  const [editingFarmName, setEditingFarmName] = useState<string | null>(null);
  const [farmNameDraft, setFarmNameDraft] = useState('');
  const [savingFarmName, setSavingFarmName] = useState(false);
  const [changingRole, setChangingRole] = useState(false);

  if (showWizard) {
    return (
      <FarmWizard
        onComplete={onWizardComplete}
        onCancel={() => onShowWizard(false)}
      />
    );
  }

  async function handleSaveFarmNameLocal(farmId: string, name: string) {
    setSavingFarmName(true);
    try {
      await onSaveFarmName(farmId, name);
      setEditingFarmName(null);
    } finally {
      setSavingFarmName(false);
    }
  }

  return (
    <section>
      <h2 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-3);color:var(--color-text)">
        🌾 {t('profile.farms')}
      </h2>

      {loading ? (
        <div style="display:flex;flex-direction:column;gap:var(--space-2)">
          {[0, 1].map((i) => <div key={i} class="skeleton skeleton-tile" />)}
        </div>
      ) : farms.length === 0 ? (
        <div style="margin-bottom:var(--space-3)">
          <div style="color:var(--color-gray-500);font-size:var(--font-size-sm)">
            {t('profile.no_farms')}
          </div>
          <FarmDiscovery />
        </div>
      ) : (
        <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-3)">
          {farms.map((farm) => {
            const isActive = farm.id === activeFarmId;
            const isAdmin = farm.role === 'admin' || farm.role === 'owner';
            const isDemoFarm = farm.id === DEMO_FARM_ID;
            const isConfirming = confirmDelete === farm.id;
            const isConfirmingLeave = confirmLeave === farm.id;
            return (
              <div key={farm.id}>
              <div
                style={`cursor:pointer;border-radius:${expandedFarm === farm.id ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)'};border:2px solid ${isActive ? 'var(--color-primary)' : 'var(--color-gray-200)'};background:${isActive ? 'var(--color-primary-light)' : 'var(--color-surface)'};overflow:hidden`}
                onClick={() => onToggleFarmDetail(farm.id)}
              >
                <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3)">
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:var(--space-1)">
                      {editingFarmName === farm.id ? (
                        <form
                          style="display:flex;gap:var(--space-1);align-items:center;flex:1;min-width:0"
                          onClick={(e) => e.stopPropagation()}
                          onSubmit={(e) => { e.preventDefault(); void handleSaveFarmNameLocal(farm.id, farmNameDraft); }}
                        >
                          <input
                            type="text"
                            value={farmNameDraft}
                            maxLength={100}
                            onInput={(e) => setFarmNameDraft((e.target as HTMLInputElement).value)}
                            style="font-size:var(--font-size-sm);padding:2px 6px;border:1px solid var(--color-primary);border-radius:var(--radius-sm);flex:1;min-width:0"
                            autoFocus
                          />
                          <button type="submit" disabled={savingFarmName} style="font-size:var(--font-size-xs);background:none;border:none;cursor:pointer">✓</button>
                          <button type="button" onClick={() => setEditingFarmName(null)} style="font-size:var(--font-size-xs);background:none;border:none;cursor:pointer">✕</button>
                        </form>
                      ) : (
                        <div style="font-weight:var(--font-weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0">
                          {farm.name}
                        </div>
                      )}
                      {isAdmin && !isDemoFarm && editingFarmName !== farm.id && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingFarmName(farm.id); setFarmNameDraft(farm.name); }}
                          style="font-size:var(--font-size-xs);background:none;border:none;cursor:pointer;padding:0 2px;color:var(--color-gray-500)"
                          aria-label="Edit farm name"
                        >✏️</button>
                      )}
                    </div>
                    <div style="display:flex;gap:var(--space-2);align-items:center;margin-top:2px">
                      <span
                        class="badge status-healthy"
                        style="font-size:var(--font-size-xs);padding:1px 6px"
                      >
                        {t(`profile.role_${farm.role}`)}
                      </span>
                      {isActive && (
                        <span style="font-size:var(--font-size-xs);color:var(--color-primary);font-weight:var(--font-weight-semibold)">
                          {t('profile.active')}
                        </span>
                      )}
                      {!isDemoFarm && (
                        <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);font-family:monospace">
                          {farm.id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);margin-top:2px">
                      {farm.elevation_m != null && `${Math.round(farm.elevation_m)}m ${t('profile.elevation_short')}`}
                      {farm.elevation_m != null && ' · '}
                      {farm.grid_rows}×{farm.grid_cols} {t('profile.beds')}
                      {isAdmin && pendingCounts[farm.id] > 0 && (
                        <span style="color:var(--color-primary);font-weight:var(--font-weight-semibold)">
                          {' · '}{pendingCounts[farm.id]} {t('join_requests.pending_count')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;gap:var(--space-2)">
                    {!isActive && (
                      <button
                        class="btn-secondary"
                        style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
                        onClick={(e) => { e.stopPropagation(); onSwitchFarm(farm.id); }}
                      >
                        {t('profile.switch')}
                      </button>
                    )}
                    {isAdmin && !isDemoFarm && (
                      <button
                        type="button"
                        style="font-size:var(--font-size-sm);color:var(--color-error,#dc2626);background:none;border:none;cursor:pointer;padding:var(--space-1) var(--space-2)"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(isConfirming ? null : farm.id); }}
                      >
                        {t('profile.delete_farm')}
                      </button>
                    )}
                    {!isDemoFarm && !isSystemAdmin && currentUser && farm.user_id !== currentUser.sub && (
                      <button
                        type="button"
                        style="font-size:var(--font-size-sm);color:var(--color-gray-600);background:none;border:none;cursor:pointer;padding:var(--space-1) var(--space-2)"
                        onClick={(e) => { e.stopPropagation(); setConfirmLeave(isConfirmingLeave ? null : farm.id); }}
                      >
                        {t('profile.leave_farm')}
                      </button>
                    )}
                  </div>
                </div>
                {isConfirming && (
                  <div style="padding:var(--space-2) var(--space-3) var(--space-3);border-top:var(--border-default);background:var(--color-surface)">
                    <div style="font-size:var(--font-size-sm);color:var(--color-error,#dc2626);margin-bottom:var(--space-2)">
                      {t('profile.confirm_delete')}
                    </div>
                    <div style="display:flex;gap:var(--space-2)">
                      <button
                        type="button"
                        class="btn-secondary"
                        style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                      >
                        {t('buttons.cancel')}
                      </button>
                      <button
                        type="button"
                        style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);background:var(--color-error,#dc2626);color:#fff;border:none;border-radius:var(--radius-sm);cursor:pointer"
                        onClick={(e) => { e.stopPropagation(); void onDeleteFarm(farm.id); }}
                      >
                        {t('profile.delete_farm')}
                      </button>
                    </div>
                  </div>
                )}
                {isConfirmingLeave && (
                  <div style="padding:var(--space-2) var(--space-3) var(--space-3);border-top:var(--border-default);background:var(--color-surface)">
                    <div style="font-size:var(--font-size-sm);color:var(--color-gray-600);margin-bottom:var(--space-2)">
                      {t('profile.confirm_leave')}
                    </div>
                    <div style="display:flex;gap:var(--space-2)">
                      <button type="button" class="btn-secondary" style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
                        onClick={(e) => { e.stopPropagation(); setConfirmLeave(null); }}>
                        {t('buttons.cancel')}
                      </button>
                      <button type="button" class="btn-primary" style="font-size:var(--font-size-sm);padding:var(--space-1) var(--space-3);min-width:auto"
                        onClick={(e) => { e.stopPropagation(); void onLeaveFarm(farm.id); }}>
                        {t('profile.leave_farm')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {expandedFarm === farm.id && (
                <div style="padding:var(--space-3);border:var(--border-default);border-top:none;border-radius:0 0 var(--radius-md) var(--radius-md);background:var(--color-surface);display:flex;flex-direction:column;gap:var(--space-2);font-size:var(--font-size-sm)">
                  {detailLoading ? (
                    <div class="skeleton" style="height:60px;border-radius:var(--radius-sm)" />
                  ) : (
                    <>
                      {farm.latitude != null && farm.longitude != null && (
                      <div style="margin-bottom:var(--space-3)">
                        <FarmLocationMap
                          latitude={farm.latitude}
                          longitude={farm.longitude}
                          elevation={farm.elevation_m}
                          farmName={farm.name}
                        />
                      </div>
                      )}
                      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2)">
                        <div>
                          <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">{t('profile.location')}</div>
                          <div>{farm.location_text || (farm.latitude != null && farm.longitude != null ? `${farm.latitude.toFixed(4)}, ${farm.longitude.toFixed(4)}` : '—')}</div>
                        </div>
                        {farm.elevation_m !== undefined && farm.elevation_m !== null && (
                          <div>
                            <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">{t('profile.elevation')}</div>
                            <div>{Math.round(farm.elevation_m)} m</div>
                          </div>
                        )}
                        <div>
                          <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">{t('profile.grid')}</div>
                          <div>{farm.grid_rows} x {farm.grid_cols} ({farm.grid_rows * farm.grid_cols} {t('profile.beds')})</div>
                        </div>
                        <div>
                          <div style="color:var(--color-gray-500);font-size:var(--font-size-xs)">{t('profile.members')}</div>
                          <div>{farmMembers?.length ?? '—'}</div>
                        </div>
                      </div>
                      {farmMembers && farmMembers.length > 0 && (
                        <div style="border-top:var(--border-default);padding-top:var(--space-2);display:flex;flex-direction:column;gap:var(--space-1)">
                          {farmMembers.map((m) => (
                            <div key={m.user_id} style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-2)">
                              <div style="display:flex;align-items:center;gap:var(--space-2);min-width:0;flex:1">
                                <Avatar
                                  displayName={m.display_name || m.user_id}
                                  thumbUrl={m.profile_picture_thumb_url}
                                  size="list"
                                  userId={m.user_id}
                                />
                                <span style="font-size:var(--font-size-sm);color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                                  {m.display_name || m.user_id.slice(0, 8) + '...'}
                                </span>
                              </div>
                              <div style="display:flex;align-items:center;gap:var(--space-1);flex-shrink:0">
                                <span class="badge status-healthy" style="font-size:var(--font-size-xs);padding:1px 6px">
                                  {t(`profile.role_${m.role}`)}
                                </span>
                                {isAdmin && m.role !== 'admin' && m.user_id !== currentUser?.sub && confirmRoleChange?.userId !== m.user_id && (
                                  <button
                                    class="btn-secondary"
                                    style="font-size:var(--font-size-xs);padding:1px 6px;line-height:1.4"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmRoleChange({ userId: m.user_id, action: m.role === 'staff' ? 'promote' : 'demote' });
                                    }}
                                  >
                                    {m.role === 'staff' ? `⬆ ${t('profile.promote')}` : `⬇ ${t('profile.demote')}`}
                                  </button>
                                )}
                                {confirmRoleChange?.userId === m.user_id && (
                                  <div style="display:flex;align-items:center;gap:var(--space-1)">
                                    <button
                                      class={confirmRoleChange.action === 'promote' ? 'btn-primary' : 'btn-danger'}
                                      style="font-size:var(--font-size-xs);padding:1px 6px;line-height:1.4"
                                      disabled={changingRole}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        setChangingRole(true);
                                        const newRole = confirmRoleChange.action === 'promote' ? 'owner' : 'staff';
                                        try {
                                          await onChangeMemberRole(farm.id, m.user_id, newRole as FarmRole);
                                          setConfirmRoleChange(null);
                                        } catch { /* API error — button stays */ }
                                        setChangingRole(false);
                                      }}
                                    >
                                      {changingRole ? '…' : confirmRoleChange.action === 'promote' ? t('profile.promote_confirm') : t('profile.demote_confirm')}
                                    </button>
                                    <button
                                      class="btn-secondary"
                                      style="font-size:var(--font-size-xs);padding:1px 6px;line-height:1.4"
                                      onClick={(e) => { e.stopPropagation(); setConfirmRoleChange(null); }}
                                    >
                                      {t('buttons.cancel')}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {isAdmin && !isDemoFarm && (
                        <div style="border-top:var(--border-default);padding-top:var(--space-2)">
                          <div style="color:var(--color-gray-500);font-size:var(--font-size-xs);margin-bottom:var(--space-1)">{t('farm.visibility_label')}</div>
                          <label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer;font-size:var(--font-size-sm)">
                            <input
                              type="checkbox"
                              checked={farm.visibility !== 'private'}
                              onChange={async () => {
                                const next = farm.visibility === 'private' ? 'public' : 'private';
                                try {
                                  await onUpdateFarmVisibility(farm.id, next);
                                } catch {
                                  showToast(t('profile.save_error'), 'error');
                                }
                              }}
                            />
                            <span>{farm.visibility === 'private' ? t('farm.visibility_private') : t('farm.visibility_public')}</span>
                          </label>
                        </div>
                      )}
                      {isAdmin && !isDemoFarm && (
                        <JoinRequestList farmId={farm.id} onMemberAdded={() => onToggleFarmDetail(farm.id)} />
                      )}
                    </>
                  )}
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}

      {canCreateFarm && (
        <>
          <button
            class="btn-primary"
            style={`width:100%${atFarmLimit ? ';opacity:0.5;cursor:not-allowed' : ''}`}
            disabled={atFarmLimit}
            onClick={() => onShowWizard(true)}
          >
            + {t('profile.new_farm')}
          </button>
          {atFarmLimit && (
            <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);margin-top:var(--space-1)">
              {t('profile.farm_limit')}
            </div>
          )}
        </>
      )}
    </section>
  );
}
