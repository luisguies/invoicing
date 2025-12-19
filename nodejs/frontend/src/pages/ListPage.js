import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadList from '../components/LoadList';
import InvoiceRules from '../components/InvoiceRules';
import GenerateInvoiceButton from '../components/GenerateInvoiceButton';
import { getLoadsGrouped, deleteLoad, generateInvoice } from '../services/api';
import './ListPage.css';

const ListPage = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getLoadsGrouped();
      setGroups(data);
    } catch (error) {
      alert('Failed to load loads: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadUpdate = (updatedLoad, options = {}) => {
    // For most updates we refresh to re-group/re-sort.
    // For driver assignment we keep the row in place until user refreshes.
    if (options.refresh) {
      loadData();
      return;
    }

    setGroups((prevGroups) => {
      if (!updatedLoad?._id) return prevGroups;

      return prevGroups.map((group) => {
        if (!group?.loads) return group;
        const idx = group.loads.findIndex((l) => l._id === updatedLoad._id);
        if (idx === -1) return group;

        const nextLoads = [...group.loads];
        nextLoads[idx] = updatedLoad;
        return { ...group, loads: nextLoads };
      });
    });
  };

  const handleLoadDelete = async (loadId) => {
    if (!window.confirm('Are you sure you want to delete this load?')) {
      return;
    }
    try {
      await deleteLoad(loadId);
      loadData();
    } catch (error) {
      alert('Failed to delete load: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleGenerateInvoice = async () => {
    setGenerating(true);
    try {
      const invoiceData = {
        includeUnconfirmed: false // Only include confirmed loads
      };

      // Use rule if selected, otherwise use all non-cancelled loads
      if (selectedRule) {
        invoiceData.rule_id = selectedRule._id;
      } else {
        // Collect all non-cancelled load IDs
        const loadIds = [];
        groups.forEach(group => {
          group.loads.forEach(load => {
            if (!load.cancelled) {
              loadIds.push(load._id);
            }
          });
        });

        if (loadIds.length === 0) {
          alert('No loads available to generate invoice');
          return;
        }
        invoiceData.load_ids = loadIds;
      }

      const result = await generateInvoice(invoiceData);

      if (result.success) {
        alert('Invoice generated successfully!');
        navigate('/print');
      }
    } catch (error) {
      alert('Failed to generate invoice: ' + (error.response?.data?.error || error.message));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading loads...</div>;
  }

  return (
    <div className="list-page">
      <div className="page-header">
        <h2>Loads</h2>
        <button onClick={loadData} className="refresh-btn">Refresh</button>
      </div>

      <InvoiceRules onRuleSelect={setSelectedRule} />

      <LoadList
        groups={groups}
        onLoadUpdate={handleLoadUpdate}
        onLoadDelete={handleLoadDelete}
      />

      <GenerateInvoiceButton
        onClick={handleGenerateInvoice}
        disabled={groups.length === 0}
        generating={generating}
        selectedRule={selectedRule}
        onClearRule={() => setSelectedRule(null)}
      />
    </div>
  );
};

export default ListPage;

