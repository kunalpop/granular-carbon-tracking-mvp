import { useEffect, useState } from "react";
import {
  ACCOUNT_CHANGE_EVENT,
  ACCOUNT_OPTIONS,
  getSelectedRole,
  SELECTED_ACCOUNT_KEY,
  type AccountRole,
} from "../../services/getSigner";
import { formatAddress } from "../../services/controlContracts";

export default function AccountControl() {
  const [role, setRole] = useState<AccountRole>(() => getSelectedRole());
  const account =
    ACCOUNT_OPTIONS.find((candidate) => candidate.role === role) ??
    ACCOUNT_OPTIONS[0];

  useEffect(() => {
    const sync = () => setRole(getSelectedRole());
    window.addEventListener(ACCOUNT_CHANGE_EVENT, sync);
    return () => window.removeEventListener(ACCOUNT_CHANGE_EVENT, sync);
  }, []);

  const handleChange = (nextRole: AccountRole) => {
    setRole(nextRole);
    window.localStorage.setItem(SELECTED_ACCOUNT_KEY, nextRole);
    window.dispatchEvent(new Event(ACCOUNT_CHANGE_EVENT));
  };

  return (
    <label className="account-control">
      <span className="account-label">Account name</span>
      <select
        value={role}
        onChange={(event) => handleChange(event.target.value as AccountRole)}
      >
        {ACCOUNT_OPTIONS.map((option) => (
          <option key={option.role} value={option.role}>
            {option.role}
          </option>
        ))}
      </select>
      <span className="account-label">Address</span>
      <span className="account-address mono">
        {formatAddress(account.address)}
      </span>
    </label>
  );
}
