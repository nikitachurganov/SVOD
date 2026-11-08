import { useState } from 'react';
import { Button, Result } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import { useSubscription } from '../../shared/hooks/subscription.hooks';
import { seatsWord } from '../billing/seatPricing';
import { CreateOrganizationModal } from './CreateOrganizationModal';

/**
 * Shown instead of the people and settings pages while the person is in their own workspace. People are
 * invited into a team: a person who bought the plan for themselves makes one here (or opens the one they
 * have) and lands on its people, where observers are free and paid seats can be added.
 */
export const PersonalWorkspaceNotice = () => {
  const [createOpen, setCreateOpen] = useState(false);
  const { user } = useAuth();
  const { organizations, setActiveOrganizationId } = useOrganization();
  const { subscription } = useSubscription();

  const ownTeams = organizations.filter((org) => !org.is_personal && org.owner_user_id === user?.id);
  const paid =
    subscription?.plan.code === 'researcher' && subscription.status === 'active' && !subscription.trial_ends_at;
  const seats = subscription?.seats ?? 1;

  const subTitle = paid
    ? `У вас тариф «Исследователь» на ${seats} ${seatsWord(seats)}. Людей приглашают в команду: наблюдатели — бесплатно, на платные места — пока они есть, или докупите места в разделе «Участники» команды.`
    : 'Оно только ваше: пригласить в него людей нельзя. Чтобы работать над опросами вместе, создайте команду, пригласите коллег и выдайте им роли.';

  return (
    <>
      <Result
        icon={<TeamOutlined />}
        title="Это ваше личное пространство"
        subTitle={subTitle}
        extra={[
          ...ownTeams.slice(0, 3).map((org) => (
            <Button key={org.id} onClick={() => setActiveOrganizationId(org.id)}>
              Открыть команду «{org.name}»
            </Button>
          )),
          <Button key="create" type="primary" onClick={() => setCreateOpen(true)}>
            {paid ? 'Создать команду и позвать людей' : 'Создать команду'}
          </Button>,
        ]}
      />
      <CreateOrganizationModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
};
