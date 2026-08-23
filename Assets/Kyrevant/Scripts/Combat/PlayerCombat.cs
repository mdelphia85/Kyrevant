using UnityEngine;

public class PlayerCombat : MonoBehaviour
{
    [SerializeField] private float attackCooldown = 0.5f;
    [SerializeField] private float attackRange = 10f;
    [SerializeField] private float attackDamage = 25f;

    private float nextAttackTime;

    private void Update()
    {
        if (InputManager.Instance == null)
        {
            return;
        }

        if (InputManager.Instance.AttackPressed &&
            Time.time >= nextAttackTime)
        {
            PerformAttack();
        }
    }

    private void PerformAttack()
    {
        nextAttackTime = Time.time + attackCooldown;

        Collider[] targets = Physics.OverlapSphere(
            transform.position,
            attackRange
        );

        Health closestHealth = null;
        float closestDistance = float.MaxValue;

        foreach (Collider targetCollider in targets)
        {
            Health health = targetCollider.GetComponentInParent<Health>();

            if (health == null)
            {
                continue;
            }

            if (health.gameObject == gameObject)
            {
                continue;
            }

            float distance = Vector3.Distance(
                transform.position,
                health.transform.position
            );

            if (distance < closestDistance)
            {
                closestDistance = distance;
                closestHealth = health;
            }
        }

        if (closestHealth != null)
        {
            closestHealth.TakeDamage(attackDamage);
        }
    }
}